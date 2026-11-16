import { useState } from 'react';
import { createProfessional, deleteProfessional, updateProfessional } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import Card from '../Card.jsx';
import {
  EMPTY_CELL, LINK_BUTTON, TABLE, TABLE_SCROLL, TABLE_WRAPPER, TBODY, TD, TD_ACTIONS, TD_FIRST, TH, TH_END, TH_START, TR,
} from '../tableStyles.js';
import { ActiveBadge, CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

const EMPTY_FORM = { name: '', specialty: '', experience: '' };

function ProfessionalForm({ professional, onSaved, onCancel }) {
  const editing = Boolean(professional);
  const [form, setForm] = useState(
    editing
      ? { name: professional.name, specialty: professional.specialty || '', experience: professional.experience || '' }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const bind = (key) => ({
    value: form[key],
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const data = {
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      experience: form.experience.trim(),
    };
    if (!data.name) {
      setError('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editing) await updateProfessional(professional.id, data);
      else await createProfessional(data);
      toast.success(editing ? 'Profesional actualizado' : 'Profesional creado');
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <Card title={editing ? 'Editar profesional' : 'Nuevo profesional'}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field id="professional-name" label="Nombre">
              <input id="professional-name" data-testid="professional-name-input" type="text" className={CONTROL} {...bind('name')} />
            </Field>
            <Field id="professional-specialty" label="Especialidad">
              <input id="professional-specialty" data-testid="professional-specialty-input" type="text" className={CONTROL} {...bind('specialty')} />
            </Field>
            <Field id="professional-experience" label="Experiencia">
              <input id="professional-experience" data-testid="professional-experience-input" type="text" className={CONTROL} {...bind('experience')} />
            </Field>
          </div>
          <FormError message={error} testId="professional-error" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>Cancelar</Button>
            <SaveButton saving={saving} testId="professional-save">Guardar</SaveButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function ProfessionalsTab({ professionals, onChanged }) {
  // `null` = form closed, 'new' = creating, otherwise the professional being edited.
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const closeForm = () => setEditing(null);
  const handleSaved = () => {
    closeForm();
    onChanged();
  };

  const runChange = async (professional, action, successMessage) => {
    setBusyId(professional.id);
    try {
      await action();
      toast.success(successMessage);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = (professional) => {
    if (professional.active) {
      setDeactivating(professional);
      setConfirmOpen(true);
    } else {
      runChange(professional, () => updateProfessional(professional.id, { active: true }), 'Profesional activado');
    }
  };

  const confirmDeactivate = async () => {
    setConfirmOpen(false);
    await runChange(deactivating, () => deleteProfessional(deactivating.id), 'Profesional desactivado');
  };

  return (
    <div>
      {editing ? (
        // `key` remounts the form when switching between "new" and a specific professional.
        <ProfessionalForm
          key={editing === 'new' ? 'new' : editing.id}
          professional={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onCancel={closeForm}
        />
      ) : (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setEditing('new')}>
            Nuevo profesional
          </Button>
        </div>
      )}

      <Card>
        <div className={TABLE_WRAPPER}>
          <div className={TABLE_SCROLL}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} ${TH_START}`}>Nombre</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Especialidad</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Experiencia</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Estado</th>
                  <th scope="col" className={`${TH} ${TH_END}`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {professionals.length === 0 && (
                  <tr><td colSpan={5} className={EMPTY_CELL}>Todavía no hay profesionales</td></tr>
                )}
                {professionals.map((professional) => (
                  <tr key={professional.id} data-testid={`professional-row-${professional.id}`} className={TR}>
                    <td className={TD_FIRST}>{professional.name}</td>
                    <td className={TD}>{professional.specialty}</td>
                    <td className={TD}>{professional.experience}</td>
                    <td className={TD}><ActiveBadge active={professional.active} /></td>
                    <td className={TD_ACTIONS}>
                      <div className="flex justify-end gap-4">
                        <button
                          type="button"
                          data-testid={`professional-edit-${professional.id}`}
                          className={`${LINK_BUTTON} text-accent`}
                          onClick={() => setEditing(professional)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          data-testid={`professional-toggle-${professional.id}`}
                          className={`${LINK_BUTTON} ${professional.active ? 'text-error' : 'text-success'}`}
                          disabled={busyId === professional.id}
                          onClick={() => handleToggle(professional)}
                        >
                          {professional.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        variant="danger"
        title="Desactivar profesional"
        message={(
          <>
            <p>¿Desactivar a {deactivating && deactivating.name}? Dejará de aparecer en el sitio público.</p>
            <p className="mt-2">Sus reservas existentes se conservan.</p>
          </>
        )}
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeactivate}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
