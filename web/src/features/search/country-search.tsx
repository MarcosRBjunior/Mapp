import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { filterCountries } from './normalize';

interface SearchOption {
  code: string;
  name: string;
}

interface CountrySearchProps {
  countries: readonly SearchOption[] | undefined;
  isError: boolean;
  onSelect: (code: string) => void;
}

export function CountrySearch({ countries, isError, onSelect }: CountrySearchProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = useMemo(
    () => (countries ? filterCountries(countries, text) : []),
    [countries, text],
  );

  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const expanded = open && text.trim() !== '';
  const placeholder = isError
    ? 'Busca indisponível'
    : countries
      ? 'Digite o nome do país'
      : 'Carregando países…';

  function select(option: SearchOption) {
    onSelect(option.code);
    setText('');
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (options.length === 0 ? -1 : (index + 1) % options.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) =>
        options.length === 0 ? -1 : index <= 0 ? options.length - 1 : index - 1,
      );
    } else if (event.key === 'Enter') {
      if (!expanded) return;
      const option = options[active] ?? options[0];
      if (option) {
        event.preventDefault();
        select(option);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="country-search">
      <label htmlFor={inputId}>Buscar país</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
        autoComplete="off"
        value={text}
        disabled={!countries}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Países encontrados"
        className="search-listbox"
        hidden={!expanded || options.length === 0}
      >
        {options.map((option, index) => (
          <li
            key={option.code}
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={index === active}
            className="search-option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select(option)}
          >
            {option.name}
          </li>
        ))}
      </ul>
      {expanded && options.length === 0 && (
        <p className="search-empty" role="status">
          Nenhum país encontrado
        </p>
      )}
    </div>
  );
}
