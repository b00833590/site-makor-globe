// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildEditableInput } from './editableInput.js';

describe('buildEditableInput', () => {
  it('creates a text input with the given value and class name', () => {
    const input = buildEditableInput('hello', 'text', 'my-class', () => {});
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
    expect(input.value).toBe('hello');
    expect(input.className).toBe('my-class');
  });

  it('creates a number input with step="any"', () => {
    const input = buildEditableInput(1.2, 'number', 'my-class', () => {});
    expect(input.type).toBe('number');
    expect(input.step).toBe('any');
  });

  it('calls onCommit with the raw string for a text input on change', () => {
    const onCommit = vi.fn();
    const input = buildEditableInput('x', 'text', 'c', onCommit);
    input.value = 'y';
    input.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith('y');
  });

  it('calls onCommit with a Number for a number input on change', () => {
    const onCommit = vi.fn();
    const input = buildEditableInput(1, 'number', 'c', onCommit);
    input.value = '2.5';
    input.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith(2.5);
  });

  it('defaults to an empty string value when given null or undefined', () => {
    expect(buildEditableInput(null, 'text', 'c', () => {}).value).toBe('');
    expect(buildEditableInput(undefined, 'text', 'c', () => {}).value).toBe('');
  });
});
