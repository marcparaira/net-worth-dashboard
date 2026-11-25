/** A wrapping group of toggle chips (checkboxes), for picking several options. */
export function Chips({
  options,
  selected,
  onChange,
  label,
  disabled = () => false,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label: string;
  /** Options that cannot be picked (unless already selected, so they can be removed). */
  disabled?: (value: string) => boolean;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="chip">
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            disabled={disabled(option.value) && !selected.includes(option.value)}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value),
              )
            }
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
