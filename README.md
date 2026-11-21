# IOCC Sharjah · Leave Bidding 2027

A live leave-bidding page for the IOCC Sharjah team.
- **Page:** GitHub Pages hosts the page.
- **Logins and data:** Firebase (project `iocc-leave-bidding`) holds the logins, staff list, bids and audit log.

This repository contains no staff information. Names, roles, groups, staff numbers, bids and the audit log live in Firebase, and you only see them after signing in.

## How it works

- **Sign-in:** staff sign in with their **staff number**. They first use a first-login password that the manager gives them; it's stored in Firebase, not in this repository. The page makes them choose their own password before they can bid.
- **Bids:** up to 4 blocks of 4 consecutive days of annual leave in 2027.
- **Order:** Group A (2027 priority) first, then Group B. Within a group it's first come, first served, by the server time each slot was saved.
- **Limits:** max 3 on leave per day; 1 Shift Lead or Controller at a time; max 2 Coordinators, or 1 while a key person (set by the manager) is on leave.
- **Overlaps:** overlapping someone's approved leave is allowed 4 times for Group A and 6 for Group B.
- **Live chance:** each possible block shows its chance of approval as everyone bids.
- **Own bids only:** nobody, the manager included, can bid for someone else; the Firebase security rules in `firestore.rules` enforce this.
- **Audit log:** every sign-in, password change and slot change is logged with its time. The log can't be edited or deleted.

## Manager tasks

- **Sign in** with login `manager`. You're asked to change your password on first sign-in.
- **Staff logins:** go to Manager controls → Staff logins. Enter the staff numbers, then press **Create all missing logins**.
- **Staff list:** change roles or groups, add or remove people in the same table.
- **Settings:** open or close bidding, set a closing time, and change the limits.
- **Download** the results and the audit log (.xlsx).
- **Forgotten password:**
  1. In the Firebase console go to Authentication → Users, find `<staffno>@iocc-staff.local` and delete it.
  2. On the page, press **Update** next to the person. Their login is recreated with the first-login password, and they must change it at next sign-in.
