import { useState } from 'react';
import { createService, deleteService, updateService } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import { formatMoney } from '../../../utils/format.js';
import Button from '../../ui/Button.jsx';
import Card from '../Card.jsx';
import {
  EMPTY_CELL, LINK_BUTTON, TABLE, TABLE_SCROLL, TABLE_WRAPPER, TBODY, TD, TD_ACTIONS, TD_FIRST, TH, TH_END, TH_START, TR,
} from '../tableStyles.js';
import { ActiveBadge, CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

const EMPTY_FORM = { name: '', description: '', price: '', duration: '', professionals: [] };

// Required-ness is checked here; the numeric limits (price >= 0, duration 5-480, lengths) belong to the
// backend, whose message is shown as is, so the two never disagree.
function validate(form) {
  if (!form.name.trim()) return 'El nombre es obligatorio';
  if (form.price === '') return 'Ingresa el precio';
  if (form.duration === '') return 'Ingresa la duración';
  if (form.professionals.length === 0) return 'Selecciona al menos un profesional';
  return '';
}

function ServiceForm({ service, professionals, onSaved, onCancel }) {
  const editing = Boolean(service);
  const [form, setForm] = useState(
    editing
      ? {
        name: service.name,
        description: service.description || '',
        price: String(service.price),
        duration: String(service.duration),
        professionals: service.professionals,
      }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const bind = (key) => ({
    value: form[key],
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const toggleProfessional = (id) => setForm((current) => ({
    ...current,
    professionals: current.professionals.includes(id)
      ? current.professionals.filter((selected) => selected !== id)
      : [...current.professionals, id],
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }

    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      duration: Number(form.duration),
      professionals: form.professionals,
    };
    setSaving(true);
    setError('');
    try {
      if (editing) await updateService(service.id, data);
      else await createService(data);
      toast.success(editing ? 'Servicio actualizado' : 'Servicio creado');
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <Card title={editing ? 'Editar servicio' : 'Nuevo servicio'}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="service-name" label="Nombre" className="md:col-span-2">
              <input id="service-name" data-testid="service-name-input" type="text" className={CONTROL} {...bind('name')} />
            </Field>
            <Field id="service-description" label="Descripción" className="md:col-span-2">
              <textarea id="service-description" data-testid="service-description-input" rows={3} className={CONTROL} {...bind('description')} />
            </Field>
            <Field id="service-price" label="Precio">
              <input id="service-price" data-testid="service-price-input" type="number" min="0" step="1" inputMode="numeric" className={CONTROL} {...bind('price')} />
            </Field>
            <Field id="service-duration" label="Duración (minutos)">
              <input id="service-duration" data-testid="service-duration-input" type="number" min="5" max="480" step="1" inputMode="numeric" className={CONTROL} {...bind('duration')} />
            </Field>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold tracking-wide text-text-secondary">Profesionales que lo ofrecen</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {professionals.map((professional) => (
                <label key={professional.id} className="flex cursor-pointer items-center gap-2 text-text-primary">
                  <input
                    type="checkbox"
                    data-testid={`service-professional-${professional.id}`}
                    checked={form.professionals.includes(professional.id)}
                    onChange={() => toggleProfessional(professional.id)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    {professional.name}
                    {!professional.active && <span className="ml-1 text-xs text-text-secondary">(inactivo)</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormError message={error} testId="service-error" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>Cancelar</Button>
            <SaveButton saving={saving} testId="service-save">Guardar</SaveButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function ServicesTab({ services, professionals, onChanged }) {
  // `null` = form closed, 'new' = creating, otherwise the service being edited.
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const professionalsById = new Map(professionals.map((professional) => [professional.id, professional]));

  const closeForm = () => setEditing(null);
  const handleSaved = () => {
    closeForm();
    onChanged();
  };

  const handleToggle = async (service) => {
    setBusyId(service.id);
    try {
      if (service.active) await deleteService(service.id);
      else await updateService(service.id, { active: true });
      toast.success(service.active ? 'Servicio desactivado' : 'Servicio activado');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {editing ? (
        <ServiceForm
          key={editing === 'new' ? 'new' : editing.id}
          service={editing === 'new' ? null : editing}
          professionals={professionals}
          onSaved={handleSaved}
          onCancel={closeForm}
        />
      ) : (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setEditing('new')}>
            Nuevo servicio
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
                  <th scope="col" className={`${TH} ${TH_START}`}>Precio</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Duración</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Profesionales</th>
                  <th scope="col" className={`${TH} ${TH_START}`}>Estado</th>
                  <th scope="col" className={`${TH} ${TH_END}`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {services.length === 0 && (
                  <tr><td colSpan={6} className={EMPTY_CELL}>Todavía no hay servicios</td></tr>
                )}
                {services.map((service) => {
                  const offered = service.professionals.map((id) => professionalsById.get(id));
                  const names = offered.map((professional, index) => (professional ? professional.name : service.professionals[index]));
                  const noActiveProfessional = !offered.some((professional) => professional && professional.active);
                  return (
                    <tr key={service.id} data-testid={`service-row-${service.id}`} className={TR}>
                      <td className={TD_FIRST}>{service.name}</td>
                      <td className={TD}>{formatMoney(service.price)}</td>
                      <td className={TD}>{service.duration} min</td>
                      <td className={`${TD} whitespace-normal`}>
                        <span>{names.join(', ')}</span>
                        {noActiveProfessional && (
                          <span className="mt-1 block text-xs font-semibold text-error">Sin profesionales activos</span>
                        )}
                      </td>
                      <td className={TD}><ActiveBadge active={service.active} /></td>
                      <td className={TD_ACTIONS}>
                        <div className="flex justify-end gap-4">
                          <button
                            type="button"
                            data-testid={`service-edit-${service.id}`}
                            className={`${LINK_BUTTON} text-accent`}
                            onClick={() => setEditing(service)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            data-testid={`service-toggle-${service.id}`}
                            className={`${LINK_BUTTON} ${service.active ? 'text-error' : 'text-success'}`}
                            disabled={busyId === service.id}
                            onClick={() => handleToggle(service)}
                          >
                            {service.active ? 'Desactivar' : 'Activar'}
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
    </div>
  );
}
