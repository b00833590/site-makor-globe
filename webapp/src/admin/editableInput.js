export function buildEditableInput(value, type, className, onCommit) {
  const input = document.createElement('input');
  input.type = type;
  if (type === 'number') input.step = 'any';
  input.className = className;
  input.value = value ?? '';
  input.addEventListener('change', () => {
    onCommit(type === 'number' ? Number(input.value) : input.value);
  });
  return input;
}
