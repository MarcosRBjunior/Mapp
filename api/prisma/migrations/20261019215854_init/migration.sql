-- CreateEnum
CREATE TYPE "country_kind" AS ENUM ('country', 'non_geographic');

-- CreateEnum
CREATE TYPE "alias_status" AS ENUM ('mapped', 'pending', 'ignored');

-- CreateEnum
CREATE TYPE "metric" AS ENUM ('cases', 'deaths');

-- CreateEnum
CREATE TYPE "sync_mode" AS ENUM ('snapshot', 'full');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('running', 'success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "checkpoint_status" AS ENUM ('pending', 'done', 'error');

-- CreateEnum
CREATE TYPE "call_outcome" AS ENUM ('ok', 'http_error', 'timeout', 'network_error', 'invalid_payload');

-- CreateTable
CREATE TABLE "data_source" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,

    CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "country_kind" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "population" BIGINT,

    CONSTRAINT "country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "country_alias" (
    "source_id" INTEGER NOT NULL,
    "source_name" TEXT NOT NULL,
    "country_code" CHAR(3),
    "status" "alias_status" NOT NULL,

    CONSTRAINT "country_alias_pkey" PRIMARY KEY ("source_id","source_name")
);

-- CreateTable
CREATE TABLE "daily_stat" (
    "country_code" CHAR(3) NOT NULL,
    "metric" "metric" NOT NULL,
    "stat_date" DATE NOT NULL,
    "source_id" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "new_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_stat_pkey" PRIMARY KEY ("country_code","metric","stat_date","source_id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "mode" "sync_mode" NOT NULL,
    "status" "sync_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "reference_date" DATE,
    "calls_used" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_checkpoint" (
    "id" SERIAL NOT NULL,
    "sync_run_id" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "status" "checkpoint_status" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_call" (
    "id" BIGSERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "sync_run_id" INTEGER,
    "called_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "outcome" "call_outcome" NOT NULL,

    CONSTRAINT "provider_call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_source_code_key" ON "data_source"("code");

-- CreateIndex
CREATE INDEX "daily_stat_source_id_metric_stat_date_idx" ON "daily_stat"("source_id", "metric", "stat_date");

-- CreateIndex
CREATE UNIQUE INDEX "sync_run_single_running" ON "sync_run"("status") WHERE (status = 'running');

-- CreateIndex
CREATE UNIQUE INDEX "sync_checkpoint_sync_run_id_unit_key" ON "sync_checkpoint"("sync_run_id", "unit");

-- CreateIndex
CREATE INDEX "provider_call_source_id_called_at_idx" ON "provider_call"("source_id", "called_at");

-- AddForeignKey
ALTER TABLE "country_alias" ADD CONSTRAINT "country_alias_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_alias" ADD CONSTRAINT "country_alias_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "country"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stat" ADD CONSTRAINT "daily_stat_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stat" ADD CONSTRAINT "daily_stat_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_checkpoint" ADD CONSTRAINT "sync_checkpoint_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_call" ADD CONSTRAINT "provider_call_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_call" ADD CONSTRAINT "provider_call_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raw SQL (not modeled by Prisma): CHECK constraints and the global materialized view.
ALTER TABLE "country"
  ADD CONSTRAINT "country_coordinates_required" CHECK ("kind" <> 'country' OR ("lat" IS NOT NULL AND "lng" IS NOT NULL)),
  ADD CONSTRAINT "country_lat_range" CHECK ("lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT "country_lng_range" CHECK ("lng" BETWEEN -180 AND 180);

ALTER TABLE "country_alias"
  ADD CONSTRAINT "country_alias_mapped_has_country" CHECK (("status" = 'mapped') = ("country_code" IS NOT NULL));

ALTER TABLE "daily_stat"
  ADD CONSTRAINT "daily_stat_total_non_negative" CHECK ("total" >= 0);

CREATE MATERIALIZED VIEW "global_daily_stat" AS
SELECT "source_id", "metric", "stat_date",
       sum("total")::bigint     AS "total",
       sum("new_value")::bigint AS "new_value",
       count(*)::int            AS "country_count"
FROM "daily_stat"
GROUP BY "source_id", "metric", "stat_date";

CREATE UNIQUE INDEX "global_daily_stat_key" ON "global_daily_stat" ("source_id", "metric", "stat_date");
