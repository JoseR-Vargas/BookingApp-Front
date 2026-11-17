import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../config/appConfig.js';
import ProfessionalAvatar, { initialsOf } from './ProfessionalAvatar.jsx';

const PHOTO = '/api/catalog/professionals/ana/photo?v=7';

describe('initialsOf', () => {
  it.each([
    ['Alex García', 'AG'],
    ['María López', 'ML'],
    ['Ana', 'A'],
    ['  juan   carlos   pérez ', 'JC'],
    ['ángel ruiz', 'ÁR'],
    ['', '?'],
    [undefined, '?'],
  ])('%j -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('ProfessionalAvatar', () => {
  it('shows the photo as a round, cropped image from the backend', () => {
    const { container } = render(<ProfessionalAvatar name="Ana Pérez" photoUrl={PHOTO} />);
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', `${APP_CONFIG.BACKEND_URL}${PHOTO}`);
    expect(image).toHaveClass('rounded-full', 'object-cover');
    expect(image).toHaveAttribute('alt', '');
  });

  it('shows the initials on a round circle when there is no photo', () => {
    const { container } = render(<ProfessionalAvatar name="Alex García" photoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    const circle = screen.getByText('AG');
    expect(circle).toHaveClass('rounded-full');
  });

  it('falls back to the initials when the photo fails to load', () => {
    const { container } = render(<ProfessionalAvatar name="Alex García" photoUrl={PHOTO} />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AG')).toBeInTheDocument();
  });

  it('tries again when the photo URL changes after a failure', () => {
    const { container, rerender } = render(<ProfessionalAvatar name="Alex García" photoUrl={PHOTO} />);
    fireEvent.error(container.querySelector('img'));
    rerender(<ProfessionalAvatar name="Alex García" photoUrl="/api/catalog/professionals/ana/photo?v=8" />);
    expect(container.querySelector('img')).not.toBeNull();
  });

  it.each([
    ['sm', 'size-8'],
    ['md', 'size-12'],
    ['lg', 'size-20'],
  ])('size %s uses %s', (size, className) => {
    const { container } = render(<ProfessionalAvatar name="Ana" photoUrl={PHOTO} size={size} />);
    expect(container.querySelector('img')).toHaveClass(className, 'shrink-0');
  });

  it('is decorative: the name next to it already names the professional', () => {
    const { container } = render(<ProfessionalAvatar name="Alex García" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
