import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StorageNotice from './StorageNotice.jsx';

const MB = 1024 * 1024;
const storage = (level, usedMb, percent) => ({ level, usedBytes: usedMb * MB, quotaBytes: 50 * MB, percent });

describe('StorageNotice', () => {
  it.each([[null], [storage('ok', 5, 10)]])('renders nothing without a reason (%#)', (value) => {
    const { container } = render(<StorageNotice storage={value} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns from 70 % with the usage', () => {
    render(<StorageNotice storage={storage('warning', 36, 72)} />);
    expect(screen.getByRole('status')).toHaveTextContent('al 72 %');
    expect(screen.getByRole('status')).toHaveTextContent('36 de 50 MB');
  });

  it('says the business stops taking bookings when it is blocked', () => {
    render(<StorageNotice storage={storage('blocked', 50, 100)} />);
    expect(screen.getByRole('alert')).toHaveTextContent('límite de almacenamiento');
    expect(screen.getByRole('alert')).toHaveTextContent('no acepta reservas nuevas');
  });
});
