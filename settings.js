// IOCC Sharjah · Leave bidding 2027 · general settings
// No staff information is kept in this public file: names, roles, groups and staff numbers live in Firebase
// and are only readable after signing in. The OCC Manager edits them on the page (Manager controls).
export const TITLE = 'IOCC Sharjah · Leave Bidding 2027';
export const LOGIN_DOMAIN = 'iocc-staff.local';   // staff number 123456 signs in as 123456@iocc-staff.local behind the scenes

// Defaults. The OCC Manager can change these on the page (Manager controls); the saved values win.
export const DEFAULTS = {
  open: false,            // bidding starts closed; the manager opens it
  closeAt: null,          // optional closing date and time
  prio: 'A',              // group with 2027 leave priority
  maxTotal: 3,            // Sharjah staff on leave on the same day
  leadCap: 1,             // Shift Leads + Controllers on leave at the same time
  hubCap: 2,              // Coordinators on leave at the same time ...
  hubKeyCap: 1,           // ... only this many while a key person is on leave
  key: [],               // key people for the Coordinator rule (set in Manager controls)
  budgetP: 4,             // overlaps allowed per year, priority group
  budgetO: 6,             // overlaps allowed per year, other group
};

