import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './common';

afterEach(cleanup);

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'First' },
    { value: 'b', label: 'Second' },
  ] as const;

  it('marks the selected option and reports clicks', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="a" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'First' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Second' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
