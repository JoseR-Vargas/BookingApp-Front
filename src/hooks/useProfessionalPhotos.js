// ===== FOTOS DE PROFESIONALES (ADMIN) =====
// Photo URL by professional id for the bookings table. It reads the ADMIN catalog because that one
// keeps deactivated professionals: their old bookings are still listed. It is decoration, so a
// failure is silent and every professional simply shows their initials.

import { useEffect, useState } from 'react';
import { getAdminCatalog } from '../services/adminService.js';

/** @returns {Record<string, string>} photo URL by professional id (only those that have a photo) */
export function useProfessionalPhotos() {
  const [photos, setPhotos] = useState({});

  useEffect(() => {
    let active = true;
    getAdminCatalog()
      .then((catalog) => {
        if (!active) return;
        const byId = {};
        for (const professional of (catalog && catalog.professionals) || []) {
          if (professional.photoUrl) byId[professional.id] = professional.photoUrl;
        }
        setPhotos(byId);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return photos;
}
