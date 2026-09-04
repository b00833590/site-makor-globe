export function ddmmToISOThisYear(dateStr, now = new Date()) {
  const match = typeof dateStr === 'string' ? /^(\d{1,2})\/(\d{1,2})$/.exec(dateStr.trim()) : null;
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Ancre sur le lundi de la semaine ISO contenant `now` (quel que soit le jour
// de la semaine, y compris samedi/dimanche), puis ajoute 4 jours pour obtenir
// le vendredi de cette même semaine — garantit un résultat correct peu importe
// le jour de la semaine où l'entreprise est ajoutée.
export function fridayOfCurrentWeekDDMM(now = new Date()) {
  const day = now.getDay(); // 0 = dimanche ... 6 = samedi
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const dd = String(friday.getDate()).padStart(2, '0');
  const mm = String(friday.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}
