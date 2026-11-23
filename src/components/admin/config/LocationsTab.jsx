import { useState } from 'react';
import { createLocation, updateLocation } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import Card from '../Card.jsx';
import {
  EMPTY_CELL, LINK_BUTTON, TABLE, TABLE_SCROLL, TABLE_WRAPPER, TBODY, TD, TD_ACTIONS, TD_FIRST, TH, TH_END, TH_START, TR,
} from '../tableStyles.js';
import { ActiveBadge, CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

function LocationForm({ location, onSaved, onCancel }) {
  const editing = Boolean(location);
  const [form, setForm] = useState({ name: location?.name || '', address: location?.address || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const bind = (key) => ({
    value: form[key],
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const data = { name: form.name.trim(), address: form.address.trim() };
    if (!data.name) {
      setError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) await updateLocation(location.id, { ...data, active: location.active !== false });
      else await createLocation(data);
      toast.success(editing ? 'Local actualizado' : 'Local creado');
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <Card title={editing ? 'Editar local' : 'Nuevo local'}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="location-name" label="Nombre">
              <input id="location-name" data-testid="location-name-input" type="text" className={CONTROL} {...bind('name')} />
            </Field>
            <Field id="location-address" label="Dirección">
              <input id="location-address" data-testid="location-address-input" type="text" className={CONTROL} {...bind('address')} />
            </Field>
          </div>
          {!editing && (
            <p className="mt-2 text-xs text-text-muted">El horario del local nuevo se configura después, en la pestaña Horarios.</p>
          )}
          <FormError message={error} testId="location-error" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>Cancelar</Button>
            <SaveButton saving={saving} testId="location-save">Guardar</SaveButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** SPEC 08: the locations of the business (create, edit, activate or deactivate). Their hours live in "Horarios". */
export default function LocationsTab({ locations, onChanged }) {
  // `null` = form closed, 'new' = creating, otherwise the location being edited.
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deactivating, setDeactivating] = useState(null);

  const handleSaved = () => {
    setEditing(null);
    onChanged();
  };

  const setActive = async (location, active) => {
    setBusyId(location.id);
    try {
      await updateLocation(location.id, { name: location.name, address: location.address || '', active });
      toast.success(active ? 'Local activado' : 'Local desactivado');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeactivate = async () => {
    const location = deactivating;
    setDeactivating(null);
    await setActive(location, false);
  };

  return (
    <div>
      {editing ? (
        <LocationForm
          key={editing === 'new' ? 'new' : editing.id}
          location={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setEditing('new')}>Nuevo local</Button>
        </div>
      )}

      <Card>
        <div className={TABLE_WRAPPER}>
          <div className={TABLE_SCROLL}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} ${TH_START}`}>Nombre</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Dirección</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Estado</th>
                  <th scope="col" className={`${TH} ${TH_END}`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {locations.length === 0 && (
                  <tr><td colSpan={4} className={EMPTY_CELL}>Todavía no hay locales</td></tr>
                )}
                {locations.map((location) => {
                  const active = location.active !== false;
                  return (
                    <tr key={location.id} data-testid={`location-row-${location.id}`} className={TR}>
                      <td className={TD_FIRST}>{location.name}</td>
                      <td className={TD}>{location.address}</td>
                      <td className={TD}><ActiveBadge active={active} /></td>
                      <td className={TD_ACTIONS}>
                        <div className="flex justify-end gap-4">
                          <button type="button" data-testid={`location-edit-${location.id}`} className={`${LINK_BUTTON} text-accent`} onClick={() => setEditing(location)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            data-testid={`location-toggle-${location.id}`}
                            className={`${LINK_BUTTON} ${active ? 'text-error' : 'text-success'}`}
                            disabled={busyId === location.id}
                            onClick={() => (active ? setDeactivating(location) : setActive(location, true))}
                          >
                            {active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(deactivating)}
        variant="danger"
        title="Desactivar local"
        message={(
          <>
            <p>¿Desactivar {deactivating && deactivating.name}? Dejará de ofrecerse en el sitio público.</p>
            <p className="mt-2">Sus reservas existentes y su horario se conservan.</p>
          </>
        )}
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}
