// "Usuarios" tab (spec 20): the accounts of the business. Only the owner reaches it (the whole
// configuration is owner-only). The backend keeps at least one active owner and answers 409 otherwise.

import { useCallback, useEffect, useState } from 'react';
import {
  changeUserRole,
  createUser,
  deactivateUser,
  listUsers,
  rotateUserPassword,
} from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import Spinner from '../../ui/Spinner.jsx';
import Card from '../Card.jsx';
import {
  TABLE, TABLE_SCROLL, TABLE_WRAPPER, TBODY, TD, TD_ACTIONS, TD_FIRST, TH, TH_END, TH_START, TR,
} from '../tableStyles.js';
import { ActiveBadge, CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

const ROLES = [
  { value: 'owner', label: 'Dueño' },
  { value: 'staff', label: 'Personal' },
  { value: 'viewer', label: 'Solo lectura' },
];
const roleLabel = (value) => ROLES.find((role) => role.value === value)?.label || value;
const EMPTY_FORM = { name: '', email: '', password: '', role: 'staff' };

function NewUserForm({ onSaved, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const bind = (key) => ({
    value: form[key],
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createUser({ ...form, name: form.name.trim(), email: form.email.trim() });
      toast.success('Usuario creado');
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <Card title="Nuevo usuario">
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="user-name" label="Nombre">
              <input id="user-name" data-testid="user-name-input" type="text" className={CONTROL} {...bind('name')} />
            </Field>
            <Field id="user-email" label="Correo">
              <input id="user-email" data-testid="user-email-input" type="email" autoComplete="off" className={CONTROL} {...bind('email')} />
            </Field>
            <Field id="user-password" label="Contraseña (mínimo 10 caracteres)">
              <input id="user-password" data-testid="user-password-input" type="password" autoComplete="new-password" className={CONTROL} {...bind('password')} />
            </Field>
            <Field id="user-role" label="Rol">
              <select id="user-role" data-testid="user-role-input" className={CONTROL} {...bind('role')}>
                {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </Field>
          </div>
          <FormError message={error} testId="user-error" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>Cancelar</Button>
            <SaveButton saving={saving} testId="user-save">Crear usuario</SaveButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function UsersTab() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // One handler for the three row actions: a failure (such as "the last owner") is shown, never swallowed.
  const act = async (action, success) => {
    try {
      await action();
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const rotate = (user) => {
    const password = window.prompt(`Nueva contraseña para ${user.email} (mínimo 10 caracteres)`);
    if (password) act(() => rotateUserPassword(user.id, password), 'Contraseña actualizada');
  };

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center text-text-secondary">
        <p>{error}</p>
        <Button size="sm" onClick={load}>Reintentar</Button>
      </div>
    );
  }
  if (!users) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
        <Spinner />
        <span>Cargando usuarios...</span>
      </div>
    );
  }

  return (
    <div>
      {creating ? (
        <NewUserForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
      ) : (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>Nuevo usuario</Button>
        </div>
      )}
      <div className={TABLE_WRAPPER}>
        <div className={TABLE_SCROLL}>
          <table className={TABLE} data-testid="users-table">
            <thead>
              <tr>
                <th className={TH_START}>Nombre</th>
                <th className={TH}>Correo</th>
                <th className={TH}>Rol</th>
                <th className={TH}>Estado</th>
                <th className={TH_END}>Acciones</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {users.map((user) => (
                <tr key={user.id} className={TR} data-testid={`user-row-${user.id}`}>
                  <td className={TD_FIRST}>{user.name}</td>
                  <td className={TD}>{user.email}</td>
                  <td className={TD}>
                    <select
                      aria-label={`Rol de ${user.email}`}
                      className={CONTROL}
                      value={user.role}
                      disabled={!user.active}
                      onChange={(event) => act(() => changeUserRole(user.id, event.target.value), 'Rol actualizado')}
                    >
                      {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                    </select>
                  </td>
                  <td className={TD}><ActiveBadge active={user.active} /></td>
                  <td className={TD_ACTIONS}>
                    {user.active && (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => rotate(user)}>Cambiar contraseña</Button>
                        <Button variant="secondary" size="sm" onClick={() => act(() => deactivateUser(user.id), 'Usuario desactivado')}>
                          Desactivar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-sm text-text-secondary">Rol actual de cada cuenta: {users.map((user) => roleLabel(user.role)).join(', ')}.</p>
    </div>
  );
}
