const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function categoryName(item) {
  if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
  if (!item || typeof item !== 'object') return '';
  return String(
    item.category_name
      || item.specialty_name
      || item.name
      || item.label
      || item.category?.category_name
      || item.category?.name
      || '',
  ).trim();
}

/** Reads only the new GET /technician/profile contract. Null means the server
 * does not support the fields yet, so the client should hide the specialties block. */
export function readTechnicianSpecialties(profileResponse) {
  const candidates = [
    profileResponse,
    profileResponse?.data,
    profileResponse?.technician,
    profileResponse?.profile,
    profileResponse?.data?.technician,
    profileResponse?.data?.profile,
  ].filter((item) => item && typeof item === 'object');
  const profile = candidates.find((item) => hasOwn(item, 'specialties') && hasOwn(item, 'accepts_all_categories'));
  if (!profile) return null;

  const records = Array.isArray(profile.specialties) ? profile.specialties : [];
  const activeRecords = records.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    return item.is_active !== false && item.is_active !== 0 && item.is_active !== 'false' && item.is_active !== '0';
  });
  const specialties = [...new Set(activeRecords.map(categoryName).filter(Boolean))];
  const categoryIds = [...new Set(activeRecords
    .map((item) => (item && typeof item === 'object' ? item.category_id ?? item.id : null))
    .filter((id) => id != null)
    .map(String))];

  return {
    available: true,
    specialties,
    categoryIds,
    acceptsAllCategories: profile.accepts_all_categories === true
      || profile.accepts_all_categories === 1
      || profile.accepts_all_categories === 'true',
  };
}
