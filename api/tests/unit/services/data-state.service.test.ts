import { describe, expect, it, vi } from 'vitest';
import type { DataStateRepository } from '../../../src/repositories/data-state.repository.js';
import {
  createDataStateService,
  DATA_VERSION_TTL_MS,
} from '../../../src/services/data-state.service.js';
import { FAKE_SOURCE } from '../../helpers/fake-repositories.js';

// Each test adjusts the mocks it needs (mockResolvedValue) before calling the service.
function stubRepo() {
  return {
    findSource: vi.fn<DataStateRepository['findSource']>().mockResolvedValue(FAKE_SOURCE),
    findDataVersion: vi.fn<DataStateRepository['findDataVersion']>().mockResolvedValue(7),
    findCoverage: vi
      .fn<DataStateRepository['findCoverage']>()
      .mockResolvedValue({ from: '2023-03-01', referenceDate: '2023-03-09', countries: 201 }),
    findIncompleteDates: vi.fn<DataStateRepository['findIncompleteDates']>().mockResolvedValue([]),
  };
}

describe('data state service', () => {
  it('returns the current state', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect(await service.current()).toEqual({
      sourceId: 1,
      dataVersion: 7,
      from: '2023-03-01',
      referenceDate: '2023-03-09',
      countries: 201,
      incompleteDates: new Set(),
    });
  });

  it('recomputes the coverage only when dataVersion changes', async () => {
    const repo = stubRepo();
    let clock = 0;
    const service = createDataStateService(repo, 'api_ninjas', { now: () => clock });

    await service.current();
    clock += DATA_VERSION_TTL_MS;
    await service.current();
    expect(repo.findCoverage).toHaveBeenCalledTimes(1);

    repo.findDataVersion.mockResolvedValue(8);
    clock += DATA_VERSION_TTL_MS;
    await service.current();
    expect(repo.findCoverage).toHaveBeenCalledTimes(2);
    expect(repo.findSource).toHaveBeenCalledTimes(1);
  });

  it('reads the dataVersion at most once per 5 s', async () => {
    const repo = stubRepo();
    let clock = 0;
    const service = createDataStateService(repo, 'api_ninjas', { now: () => clock });

    await service.current();
    clock += DATA_VERSION_TTL_MS - 1;
    await service.current();
    expect(repo.findDataVersion).toHaveBeenCalledTimes(1);

    clock += 1;
    await service.current();
    expect(repo.findDataVersion).toHaveBeenCalledTimes(2);
  });

  it('is not ready without dataVersion', async () => {
    const repo = stubRepo();
    repo.findDataVersion.mockResolvedValue(null);
    const service = createDataStateService(repo, 'api_ninjas');

    expect(await service.current()).toBeNull();
    await expect(service.resolveDate(undefined)).rejects.toMatchObject({
      code: 'DATA_NOT_READY',
      httpStatus: 503,
    });
  });

  it('is not ready without a reference date', async () => {
    const repo = stubRepo();
    repo.findCoverage.mockResolvedValue({ from: '2023-03-01', referenceDate: null, countries: 3 });
    const service = createDataStateService(repo, 'api_ninjas');

    expect(await service.current()).toBeNull();
  });

  it('fails loudly when the source is not seeded, and retries next time', async () => {
    const repo = stubRepo();
    repo.findSource.mockResolvedValue(null);
    const service = createDataStateService(repo, 'api_ninjas');

    await expect(service.source()).rejects.toThrow(/api_ninjas is not seeded/);
    await expect(service.source()).rejects.toThrow(/not seeded/);
    expect(repo.findSource).toHaveBeenCalledTimes(2);
  });

  it('resolves a missing date to the reference date', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect((await service.resolveDate(undefined)).date).toBe('2023-03-09');
  });

  it('accepts a date inside the coverage with a global row', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect((await service.resolveDate('2023-03-05')).date).toBe('2023-03-05');
  });

  it.each(['2023-02-28', '2023-03-10'])('rejects %s outside the coverage', async (date) => {
    const repo = stubRepo();
    const service = createDataStateService(repo, 'api_ninjas');

    await expect(service.resolveDate(date)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      message: 'date is outside the data coverage',
      details: { from: '2023-03-01', to: '2023-03-09' },
    });
  });

  it('rejects a date inside the range that is not complete', async () => {
    const repo = stubRepo();
    repo.findIncompleteDates.mockResolvedValue(['2023-03-05']);
    const service = createDataStateService(repo, 'api_ninjas');

    await expect(service.resolveDate('2023-03-05')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { from: '2023-03-01', to: '2023-03-09' },
    });
  });

  it('validates dates from memory, without a query per request', async () => {
    const repo = stubRepo();
    const service = createDataStateService(repo, 'api_ninjas');

    await service.resolveDate('2023-03-05');
    await service.resolveDate('2023-03-06');

    expect(repo.findIncompleteDates).toHaveBeenCalledTimes(1);
  });

  it('reloads the incomplete dates when the data version changes', async () => {
    let clock = 0;
    const repo = stubRepo();
    const service = createDataStateService(repo, 'api_ninjas', { now: () => clock });

    await service.resolveDate('2023-03-05');
    repo.findDataVersion.mockResolvedValue(8);
    repo.findIncompleteDates.mockResolvedValue(['2023-03-05']);
    clock += 10_000;

    await expect(service.resolveDate('2023-03-05')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repo.findIncompleteDates).toHaveBeenCalledTimes(2);
  });
});

describe('data state service: resolveRange', () => {
  it('defaults to the whole coverage', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect(await service.resolveRange(undefined, undefined)).toMatchObject({
      from: '2023-03-01',
      to: '2023-03-09',
    });
  });

  it('keeps a range inside the coverage', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect(await service.resolveRange('2023-03-02', '2023-03-05')).toMatchObject({
      from: '2023-03-02',
      to: '2023-03-05',
    });
  });

  it('rejects from after to', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    await expect(service.resolveRange('2023-03-05', '2023-03-02')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'from must not be after to',
      details: { from: '2023-03-05', to: '2023-03-02' },
    });
  });

  it.each([
    ['2023-02-28', undefined],
    [undefined, '2023-03-10'],
    ['2023-03-10', undefined],
  ])('rejects from=%s to=%s outside the coverage', async (from, to) => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    await expect(service.resolveRange(from, to)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'date is outside the data coverage',
      details: { from: '2023-03-01', to: '2023-03-09' },
    });
  });

  it('is not ready without data', async () => {
    const repo = stubRepo();
    repo.findDataVersion.mockResolvedValue(null);
    const service = createDataStateService(repo, 'api_ninjas');

    await expect(service.resolveRange(undefined, undefined)).rejects.toMatchObject({
      code: 'DATA_NOT_READY',
    });
  });
});
