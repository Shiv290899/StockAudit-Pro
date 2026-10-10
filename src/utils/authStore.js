// Storage keys
const OWNER_AUTH_KEY = 'stockaudit_owner_auth';
const STAFF_ROSTER_KEY = 'stockaudit_staff_roster';
const ACTIVE_SESSION_USER_KEY = 'stockaudit_active_user';

// Default initial credentials
export const DEFAULT_OWNER_CREDS = {
  username: 'admin',
  password: '123'
};

export const DEFAULT_STAFF_LOGIN = {
  username: 'staff',
  password: '123'
};

// Default staff roster with 4-digit PIN codes set by owner
export const INITIAL_STAFF_ROSTER = [
  { id: 'stf_1', name: 'Divya', pin: '1111', role: 'Floor Staff', active: true },
  { id: 'stf_2', name: 'Ramesh', pin: '2222', role: 'Auditor', active: true },
  { id: 'stf_3', name: 'Suresh', pin: '3333', role: 'Godown Incharge', active: true },
  { id: 'stf_4', name: 'Kiran', pin: '4444', role: 'Inventory Staff', active: true },
  { id: 'stf_5', name: 'Mahesh', pin: '5555', role: 'Floor Staff', active: true },
  { id: 'stf_6', name: 'Naveen', pin: '6666', role: 'Floor Staff', active: true },
  { id: 'stf_7', name: 'Pooja', pin: '7777', role: 'Auditor', active: true },
  { id: 'stf_8', name: 'Ganesh', pin: '8888', role: 'Godown Staff', active: true },
];

export function getStaffRoster() {
  try {
    const raw = localStorage.getItem(STAFF_ROSTER_KEY);
    return raw ? JSON.parse(raw) : INITIAL_STAFF_ROSTER;
  } catch {
    return INITIAL_STAFF_ROSTER;
  }
}

export function saveStaffRoster(roster) {
  localStorage.setItem(STAFF_ROSTER_KEY, JSON.stringify(roster));
}

export function updateStaffPin(staffId, newPin) {
  const roster = getStaffRoster();
  const updated = roster.map(s => s.id === staffId ? { ...s, pin: String(newPin).trim() } : s);
  saveStaffRoster(updated);
  return updated;
}

export function addStaffMember(name, pin, role = 'Staff') {
  const roster = getStaffRoster();
  const newStaff = {
    id: `stf_${Date.now()}`,
    name: name.trim(),
    pin: String(pin).trim(),
    role: role.trim(),
    active: true
  };
  const updated = [...roster, newStaff];
  saveStaffRoster(updated);
  return updated;
}

export function deleteStaffMember(staffId) {
  const roster = getStaffRoster();
  const updated = roster.filter(s => s.id !== staffId);
  saveStaffRoster(updated);
  return updated;
}

export function getActiveUser() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setActiveUser(user) {
  if (user) {
    localStorage.setItem(ACTIVE_SESSION_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(ACTIVE_SESSION_USER_KEY);
  }
}
