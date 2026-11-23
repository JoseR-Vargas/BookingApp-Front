import { useRef, useState } from 'react';
import {
  createProfessional,
  deleteProfessional,
  deleteProfessionalPermanently,
  deleteProfessionalPhoto,
  updateProfessional,
  uploadProfessionalPhoto,
} from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import { activeLocations, catalogLocations } from '../../../utils/locations.js';
import { PHOTO_TYPES, resizeToSquareJpeg } from '../../../utils/resizeImage.js';
import Button from '../../ui/Button.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import ProfessionalAvatar from '../../ui/ProfessionalAvatar.jsx';
import { professionalSchema } from '../../../schemas/forms/professional.schema.js';
import { validate } from '../../../schemas/validate.js';
import Card from '../Card.jsx';
import {
  EMPTY_CELL, LINK_BUTTON, TABLE, TABLE_SCROLL, TABLE_WRAPPER, TBODY, TD, TD_ACTIONS, TD_FIRST, TH, TH_END, TH_START, TR,
} from '../tableStyles.js';
import { ActiveBadge, CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

const EMPTY_FORM = { name: '', specialty: '', experience: '' };

function ProfessionalForm({ professional, locations, onSaved, onCancel }) {
  const editing = Boolean(professional);
  // SPEC 08: only a business with several active locations is asked where the professional works.
  const choices = activeLocations({ locations });
  const askLocations = choices.length > 1;
  const [locationIds, setLocationIds] = useState(() => {
    const own = editing && Array.isArray(professional.locations) ? professional.locations : null;
    return own || [choices[0].id];
  });
  const toggleLocation = (id) => {
    setLocationIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setError('');
  };
  const [form, setForm] = useState(
    editing
      ? { name: professional.name, specialty: professional.specialty || '', experience: professional.experience || '' }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Profile photo (SPEC 04): `newPhoto` is the resized data URL picked in this form (uploaded on
  // save); `photoRemoved` marks the current photo for deletion on save.
  const [newPhoto, setNewPhoto] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef(null);

  const currentPhotoUrl = editing && !photoRemoved ? professional.photoUrl || null : null;
  const previewUrl = newPhoto || currentPhotoUrl;

  const handlePhotoPick = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      setNewPhoto(await resizeToSquareJpeg(file));
      setPhotoRemoved(false);
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = () => {
    setNewPhoto(null);
    setPhotoRemoved(true);
    setPhotoError('');
  };

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
    // Catalog order, so the request does not depend on the click order.
    if (askLocations) data.locations = choices.map((choice) => choice.id).filter((id) => locationIds.includes(id));
    const problem = validate(professionalSchema({ requireLocations: askLocations }), data);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editing) await updateProfessional(professional.id, data);
      else await createProfessional(newPhoto ? { ...data, photoDataUrl: newPhoto } : data);
    } catch (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    // Creating sends the photo with the professional. Editing changes it right after the data.
    if (editing && (newPhoto || (photoRemoved && professional.photoUrl))) {
      try {
        if (newPhoto) await uploadProfessionalPhoto(professional.id, newPhoto);
        else await deleteProfessionalPhoto(professional.id);
      } catch (err) {
        toast.error(`Los datos se guardaron, pero la foto no: ${err.message}`);
        onSaved();
        return;
      }
    }
    toast.success(editing ? 'Profesional actualizado' : 'Profesional creado');
    onSaved();
  };

  return (
    <div className="mb-6">
      <Card title={editing ? 'Editar profesional' : 'Nuevo profesional'}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <div data-testid="professional-photo-preview">
              <ProfessionalAvatar name={form.name} photoUrl={previewUrl} size="lg" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="professional-photo" className="text-sm font-semibold text-text-secondary">
                Foto de perfil (opcional)
              </label>
              <input
                id="professional-photo"
                ref={fileInput}
                data-testid="professional-photo-input"
                type="file"
                accept={PHOTO_TYPES.join(',')}
                disabled={photoBusy || saving}
                onChange={handlePhotoPick}
                className="text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-bg-tertiary file:px-3 file:py-1.5 file:text-text-primary"
              />
              <p className="text-xs text-text-muted">PNG, JPG o WebP. Se recorta en círculo desde el centro.</p>
            </div>
            {previewUrl && (
              <Button variant="outline" size="sm" disabled={photoBusy || saving} onClick={handlePhotoRemove}>
                Quitar foto
              </Button>
            )}
          </div>
          <FormError message={photoError} testId="professional-photo-error" />
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
          {askLocations && (
            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-semibold text-text-secondary">Locales donde trabaja</legend>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {choices.map((choice) => (
                  <li key={choice.id}>
                    <label htmlFor={`professional-location-${choice.id}`} className="flex cursor-pointer items-center gap-2 text-text-secondary">
                      <input
                        id={`professional-location-${choice.id}`}
                        data-testid={`professional-location-${choice.id}`}
                        type="checkbox"
                        checked={locationIds.includes(choice.id)}
                        onChange={() => toggleLocation(choice.id)}
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      <span>{choice.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
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

export default function ProfessionalsTab({ professionals, locations, onChanged }) {
  const allLocations = catalogLocations({ locations });
  const showLocations = activeLocations({ locations }).length > 1;
  const locationNames = (ids) => allLocations.filter((location) => (ids || []).includes(location.id)).map((location) => location.name).join(', ');
  // `null` = form closed, 'new' = creating, otherwise the professional being edited.
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Permanent delete has its own confirmation: it cannot be undone.
  const [removing, setRemoving] = useState(null);
  const [removeOpen, setRemoveOpen] = useState(false);

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

  const handleRemove = (professional) => {
    setRemoving(professional);
    setRemoveOpen(true);
  };

  // A blocked delete (future bookings, last professional of a service) comes back as a 409 whose
  // message already explains what to do: runChange shows it as an error toast.
  const confirmRemove = async () => {
    setRemoveOpen(false);
    await runChange(removing, () => deleteProfessionalPermanently(removing.id), 'Profesional eliminado');
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
          locations={allLocations}
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
                  {showLocations && <th scope="col" className={`${TH} ${TH_START}`}>Locales</th>}
                  <th scope="col" className={`${TH} ${TH_START}`}>Estado</th>
                  <th scope="col" className={`${TH} ${TH_END}`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {professionals.length === 0 && (
                  <tr><td colSpan={showLocations ? 6 : 5} className={EMPTY_CELL}>Todavía no hay profesionales</td></tr>
                )}
                {professionals.map((professional) => (
                  <tr key={professional.id} data-testid={`professional-row-${professional.id}`} className={TR}>
                    <td className={TD_FIRST}>
                      <div className="flex items-center gap-3">
                        <ProfessionalAvatar name={professional.name} photoUrl={professional.photoUrl} size="sm" />
                        <span>{professional.name}</span>
                      </div>
                    </td>
                    <td className={TD}>{professional.specialty}</td>
                    <td className={TD}>{professional.experience}</td>
                    {showLocations && <td className={TD}>{locationNames(professional.locations)}</td>}
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
                        <button
                          type="button"
                          data-testid={`professional-delete-${professional.id}`}
                          className={`${LINK_BUTTON} text-error`}
                          disabled={busyId === professional.id}
                          onClick={() => handleRemove(professional)}
                        >
                          Eliminar
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

      <ConfirmDialog
        open={removeOpen}
        variant="danger"
        title="Eliminar profesional"
        message={(
          <>
            <p>¿Eliminar a {removing && removing.name} de forma permanente? Se borran su ficha y su foto, y no se puede deshacer.</p>
            <p className="mt-2">Sus reservas pasadas se conservan con su nombre. Si solo quieres ocultarlo del sitio, usa Desactivar.</p>
          </>
        )}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </div>
  );
}
