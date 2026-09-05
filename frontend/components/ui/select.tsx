'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

const toStringValue = (value: unknown) => (value == null ? '' : String(value));

const optionLabelFromNode = (node: React.ReactNode): string => {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(optionLabelFromNode).join('');
  if (React.isValidElement(node)) return optionLabelFromNode(node.props.children);
  return '';
};

const extractOptions = (children: React.ReactNode): SelectOption[] => {
  const options: SelectOption[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      options.push(...extractOptions(child.props.children));
      return;
    }
    if (typeof child.type === 'string' && child.type.toLowerCase() === 'option') {
      const value = toStringValue(child.props.value);
      options.push({
        value,
        label: optionLabelFromNode(child.props.children) || value,
        disabled: !!child.props.disabled
      });
    }
  });
  return options;
};

export function Select({ className, children, value, defaultValue, onChange, disabled, required, name, id, ...props }: SelectProps) {
  const options = React.useMemo(() => extractOptions(children), [children]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(() => toStringValue(defaultValue));
  const selectedValue = isControlled ? toStringValue(value) : internalValue;

  const selectedOption = React.useMemo(() => options.find(option => option.value === selectedValue), [options, selectedValue]);
  const selectedLabel = selectedOption?.label || selectedValue || '';

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(selectedLabel);
  const [hasTyped, setHasTyped] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  React.useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setHasTyped(false);
        setQuery(selectedLabel);
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [selectedLabel]);

  const filteredOptions = React.useMemo(() => {
    const keyword = hasTyped ? query.trim().toLowerCase() : '';
    if (!keyword) return options;
    return options.filter(option => option.label.toLowerCase().includes(keyword) || option.value.toLowerCase().includes(keyword));
  }, [options, query, hasTyped]);

  React.useEffect(() => {
    if (!open) {
      setHighlightedIndex(-1);
      return;
    }
    const firstEnabledIndex = filteredOptions.findIndex(option => !option.disabled);
    setHighlightedIndex(firstEnabledIndex);
  }, [open, filteredOptions]);

  const emitChange = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      const nextLabel = options.find(option => option.value === nextValue)?.label || nextValue;
      setQuery(nextLabel);
      setHasTyped(false);
      setOpen(false);
      if (onChange) {
        const event = {
          target: { value: nextValue },
          currentTarget: { value: nextValue }
        } as unknown as React.ChangeEvent<HTMLSelectElement>;
        onChange(event);
      }
    },
    [isControlled, onChange, options]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      for (let i = highlightedIndex + 1; i < filteredOptions.length; i += 1) {
        if (!filteredOptions[i].disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      for (let i = highlightedIndex - 1; i >= 0; i -= 1) {
        if (!filteredOptions[i].disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
      return;
    }

    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const highlightedOption = filteredOptions[highlightedIndex];
      if (highlightedOption && !highlightedOption.disabled) {
        emitChange(highlightedOption.value);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setHasTyped(false);
      setQuery(selectedLabel);
    }
  };

  const inputValue = hasTyped ? query : selectedLabel;
  const ariaLabel = (props as Record<string, unknown>)['aria-label'] as string | undefined;
  const ariaLabelledBy = (props as Record<string, unknown>)['aria-labelledby'] as string | undefined;

  return (
    <div ref={containerRef} className={cn('relative min-w-0', className)}>
      <input
        className={cn(
          'h-10 w-full min-w-0 rounded-xl border border-border bg-cream px-3 pr-8 text-sm outline-none transition focus:border-accent',
          disabled ? 'cursor-not-allowed opacity-60' : ''
        )}
        value={inputValue}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setHasTyped(false);
          setQuery(selectedLabel);
        }}
        onChange={event => {
          if (disabled) return;
          setOpen(true);
          setHasTyped(true);
          setQuery(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={selectedLabel ? '' : 'Type to search...'}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        role="combobox"
        aria-expanded={open}
        aria-controls={id ? `${id}-listbox` : undefined}
        aria-autocomplete="list"
        disabled={disabled}
      />
      <span className="pointer-events-none absolute right-3 top-5 -translate-y-1/2 text-sm leading-none text-muted">▾</span>
      <select
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        id={id}
        name={name}
        value={selectedValue}
        required={required}
        disabled={disabled}
        onChange={() => undefined}
        {...props}
      >
        {children}
      </select>
      {open && !disabled ? (
        <div
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute left-0 right-0 top-10 z-50 max-h-56 overflow-auto rounded-xl border border-border bg-white shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">No matches</p>
          ) : (
            filteredOptions.map((option, index) => {
              const isSelected = option.value === selectedValue;
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  className={cn(
                    'block w-full px-3 py-2 text-left text-sm',
                    option.disabled ? 'cursor-not-allowed text-muted/70' : 'hover:bg-[#f5ede3]',
                    isSelected ? 'font-semibold text-ink' : 'text-ink',
                    isHighlighted ? 'bg-[#f5ede3]' : ''
                  )}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => {
                    if (option.disabled) return;
                    emitChange(option.value);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                >
                  {option.label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
