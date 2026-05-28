# GGRC Casita Invoices — Functional Specifications

**System:** OnBase (iStrata)
**Client:** Garden of the Gods Resort, Wellness & Club — Colorado Springs, CO
**Module:** GGRC
**Document Date:** 2026-05-28

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Global Toolbar & Navigation](#2-global-toolbar--navigation)
3. [Lot Information — List View](#3-lot-information--list-view)
4. [Lot Information — Detail View](#4-lot-information--detail-view)
5. [Owner Information](#5-owner-information)
6. [Owner Contact Information](#6-owner-contact-information)
7. [Lot Room Information](#7-lot-room-information)
8. [Lot Statement Adjustment Tracking](#8-lot-statement-adjustment-tracking)
9. [Lot Statements (Owner Invoice)](#9-lot-statements-owner-invoice)
10. [Lot Invoice Statistics](#10-lot-invoice-statistics)
11. [Reports](#11-reports)
12. [Setup Maintenance](#12-setup-maintenance)
13. [Data Relationships](#13-data-relationships)
14. [Business Rules & Calculations](#14-business-rules--calculations)

---

## 1. System Overview

The GGRC Casita Invoices module operates within the **OnBase (iStrata)** platform and manages the full financial relationship between Garden of the Gods Resort & Club and individual casita lot owners. Lot owners participate in a rental program where the resort rents their units to guests and remits a monthly owner payout after deducting agreed-upon fees and expenses.

### Core Workflow

```
Lot Created → Owner Assigned → Rooms Configured
       ↓
Reservation Activity Imported (nightly stay data)
       ↓
Monthly Statement Generated (per lot, per activity period)
       ↓
Manual Adjustments Applied (if needed)
       ↓
Owner Payout Calculated & Statement Distributed
```

---

## 2. Global Toolbar & Navigation

### Top Navigation Bar (OnBase)

The GGRC module is accessed via the **GGRC** tab in the OnBase top navigation. Additional tabs visible in the environment include:

- Home
- Canvas
- HY – Client Admin and Health Coaching
- iStrata – Case Management
- iStrata – Management
- Stratafied Memberships
- **GGRC** (active module)
- Filter (active filter mode indicator)

### List View Toolbar Actions

| Action | Description |
|---|---|
| **Open** | Opens the selected record in detail view |
| **Create** | Creates a new record of the current object type |
| **Delete** | Deletes the selected record (with confirmation) |
| **Add to Favorites** | Pins this filter/view to the user's Favorites panel |
| **Add to Personal Page** | Adds this view as a tile on the user's personal dashboard |
| **Add to Tile Groups** | Adds to a shared tile group |
| **Save Filter Settings** | Persists current filter configuration |
| **Reset Filter Settings** | Clears all active filters to defaults |
| **Display Column Chooser** | Opens dialog to show/hide and reorder columns |
| **Auto Size Column Widths** | Auto-fits all column widths to content |
| **Open in New Window** | Opens selected record in a separate window |
| **Collapse All** | Collapses all expanded subfilter groups |
| **Print** | Sends current list/record to print dialog |
| **Print Preview** | Renders a print preview of the current view |
| **Export to Excel** | Exports the current result set to an Excel file |
| **Compose Document** | Generates a composed document from the selected record |
| **Refresh** | Refreshes the current view/list |
| **Retrieve All Records** | Bypasses pagination and loads all matching records |

### Detail View Toolbar Actions

| Action | Description |
|---|---|
| **Save** | Saves changes to the current record |
| **Save and Close** | Saves and returns to the list view |
| **Save and New** | Saves and opens a blank new record of the same type |
| **Copy Object** | Duplicates the current record as a new draft |
| **Delete** | Deletes the current record |
| **Add to** | Adds to favorites or personal page |
| **Subscribe** | Subscribes the current user to notifications on this record |
| **Refresh** | Reloads the record from the database |
| **History** | Opens the full audit/change history for this record |
| **Documents** | Opens the associated documents panel |
| **Forms** | Opens associated forms (grayed out when not applicable) |
| **Import** | Imports data into the record |
| **Compose** | Composes a document from this record |
| **Discussions** | Views all discussion threads on this record |
| **Start a Discussion** | Opens a new discussion thread |
| **First / Previous / Next / Last Object** | Navigates through records in the current result set |

---

## 3. Lot Information — List View

**Navigation:** GGRC → Lot and Owner Maintenance → Lot Information

### Purpose

Provides a searchable, filterable list of all casita lots registered in the system. Serves as the primary entry point for looking up and managing individual lots.

### Grid Columns

| Column | Description |
|---|---|
| **Lot #** | Unique sequential lot identifier (numeric) |
| **Account No** | Financial account number associated with the lot |
| **Lot Address** | Street address of the casita unit |
| **Lot City** | City where the lot is located |
| **Lot State** | State abbreviation |
| **Lot Zip** | ZIP+4 postal code |

### Sample Data Pattern

Lots are numbered sequentially (20, 21, 22…). Account numbers increment by 3 per lot (401, 404, 407…). All lots in the sample data are located on Lone Mountain View, Colorado Springs, CO 80904-0000.

### Filter Behavior

- Each column supports individual filter/search inputs (shown as filter row below headers)
- Column headers include aggregate/sum indicators (Σ)
- The active filter is named "Lot Information" and is displayed as a tab in the main panel

---

## 4. Lot Information — Detail View

**Navigation:** GGRC → Lot and Owner Maintenance → Lot Information → [Open Record]

### Purpose

The central hub record for a casita lot. Displays all related data panels in a single scrollable view and provides links to associated sub-objects.

### Header Section (Read-Only Context)

Displays the lot's identifying information as context. Branded with the Garden of the Gods Resort, Wellness & Club logo.

### Sub-Panels Displayed

| Panel | Description |
|---|---|
| **Owner and Room Information** | Shows the current owner record and associated room(s) for this lot |
| **View and Create Statements** | List of all monthly statements generated for this lot; allows new statement creation |
| **Lot Statistics** | Summary statistics panels (see Section 10) |

### Navigation

The detail view supports First / Previous / Next / Last navigation, allowing a user to move through all lots in the filtered result set without returning to the list view.

---

## 5. Owner Information

**Navigation:** GGRC → Lot and Owner Maintenance → Owner Information
**Accessed From:** Lot Information detail view → Owner panel

### Purpose

Records the legal ownership details for each lot, including owner entity name, contact information, purchase date, and reserve account status.

### Header Fields (Context, from parent Lot)

| Field | Description |
|---|---|
| **Lot #** | Parent lot number (read-only, inherited) |
| **Lot Address** | Street address of the lot (read-only, inherited) |

### Owner Detail Fields

| Field | Required | Description |
|---|---|---|
| **Owner Name** | Yes | Legal name of the owner entity (individual or LLC) |
| **Account No** | Yes | Financial account number for this ownership record |
| **Date of Purchase** | Yes | Date the owner acquired the lot |
| **Ownership End Date** | No | Date ownership ended (blank if currently active) |
| **Reserve Account (Yes/No)** | No | Dropdown — indicates whether the owner maintains a reserve fund |
| **Reserve Balance** | No | Current reserve account balance (e.g., $10,000.00) |
| **Owner Address** | No | Street address of the owner |
| **Owner City** | No | Owner's city |
| **Owner State** | No | Owner's state (dropdown) |
| **Owner Zip** | No | Owner's ZIP+4 code |
| **Owner Main Phone Number** | No | Primary contact phone |
| **Owner Main Email** | No | Primary contact email address |
| **Owner Note** | No | Free-text notes field (large text area) |

### Owner Contact Information Sub-Grid

Displays all contacts associated with this owner record. Multiple contacts can be linked (e.g., multiple owners of an LLC).

| Column | Description |
|---|---|
| **Contact Type** | Role of the contact (e.g., Owner) |
| **Owner Sub-Account No** | Sub-account identifier (e.g., 401-1) |
| **Contact First Name** | First name of the contact |
| **Contact Last Name** | Last name of the contact |
| **Contact Phone** | Contact's phone number |
| **Contact Email** | Contact's email address |

Sub-grid toolbar supports: Add, Edit, Delete, Export, Expand rows.

---

## 6. Owner Contact Information

**Navigation:** Owner Information → Owner Contact Information sub-grid → [Open Record]

### Purpose

Stores individual contact records for each person associated with a lot owner entity. Supports multiple contacts per ownership (e.g., co-owners, legal contacts).

### Header Fields (Context, from parent Owner)

| Field | Description |
|---|---|
| **Account No** | Parent owner account number (read-only) |
| **Owner Name** | Parent owner name (read-only) |
| **Owner Address** | Parent owner address (read-only) |

### Contact Detail Fields

| Field | Description |
|---|---|
| **Contact Type** | Dropdown — categorizes the relationship (e.g., Owner, Agent, Emergency) |
| **Owner Sub-Account No** | Sub-account number for this contact (e.g., 401-1) |
| **Contact First Name** | First name |
| **Contact Last Name** | Last name |
| **Contact Address** | Street address |
| **Contact City** | City |
| **Contact State** | State (dropdown) |
| **Contact Zip** | ZIP code |
| **Contact Phone** | Phone number |
| **Contact Email** | Email address |
| **Contact Note** | Free-text notes |

### Audit Fields

- **Created By:** Username of the record creator (e.g., MANAGER)
- **Created Date/Time:** Timestamp of record creation

---

## 7. Lot Room Information

**Navigation:** GGRC → Lot and Owner Maintenance → Lot and Associated Room Information → [Record]
**Accessed From:** Lot Information detail view → Owner and Room Information panel

### Purpose

Defines the individual rentable room(s) associated with a lot. A single lot may contain multiple rooms (e.g., Room 401, 401A, 402, 403), each tracked independently for rental activity and revenue.

### Header Fields (Context, from parent Lot)

| Field | Description |
|---|---|
| **Lot #** | Parent lot number (read-only) |
| **Account No** | Account number (with lookup/search icon) |
| **Lot Address** | Street address (read-only) |

### Room Detail Fields

| Field | Description |
|---|---|
| **Room #** | Room identifier (alphanumeric, e.g., 401, 401A, 402, 403) |
| **Room Type** | Dropdown — room classification code (e.g., QCAS, KCAS) |
| **Room Note** | Free-text notes for this room |

### Audit Fields

- **Created By:** Username (e.g., MANAGER)
- **Created Date/Time:** Timestamp

### Business Notes

- One lot can have multiple room records (multi-unit casitas)
- Room # and Room Type are used to match against reservation/PMS import data
- Room Type codes (e.g., QCAS = Queen Casita, KCAS = King Casita) correspond to property management system room type codes

---

## 8. Lot Statement Adjustment Tracking

**Object Name in System:** Lot Manual Expense Tracking
**Form Title Displayed:** Lot Statement Adjustment Tracking

### Purpose

Allows staff to manually record financial adjustments (positive or negative) that are applied to an owner's monthly statement. Used to correct rate discrepancies, apply package adjustments, or record other one-time charges or credits.

### Detail Fields

| Field | Required | Description |
|---|---|---|
| **Adjustment Type** | Yes | Dropdown — categorizes the adjustment (e.g., Room Rate Adjustment) |
| **Adjustment Name** | Yes | Descriptive name for the adjustment (e.g., "5/6/25 Package Adjustment - Room 403") |
| **Adjustment Date** | Yes | Date the adjustment is effective (applied to a specific statement period) |
| **Adjustment Amount** | Yes | Dollar amount; negative values displayed in parentheses (e.g., ($25.00)) |
| **Adjustment Note** | No | Raw detail note — typically contains PMS-sourced data: date, room, amount, confirmation #, group code, stay dates, nights, room type, status, booking type |

### Adjustment Note Format (PMS Data)

The Adjustment Note field typically contains a structured data string from the property management system import, for example:

```
5/6/2025  403 KCAS  $(25.00)  327503926  GRP  5/7/2025  5/6/2025  1  KCAS  CHECKED OUT  Group
```

| Position | Example Value | Description |
|---|---|---|
| 1 | 5/6/2025 | Activity date |
| 2 | 403 | Room number |
| 3 | KCAS | Room type code |
| 4 | $(25.00) | Adjustment amount |
| 5 | 327503926 | Confirmation/reservation number |
| 6 | GRP | Rate/group code |
| 7 | 5/7/2025 | Departure date |
| 8 | 5/6/2025 | Arrival date |
| 9 | 1 | Number of nights |
| 10 | KCAS | Room type |
| 11 | CHECKED OUT | Reservation status |
| 12 | Group | Booking type |

### Audit Fields

- **Created By:** Username (e.g., GGRC)
- **Created Date/Time:** Timestamp

---

## 9. Lot Statements (Owner Invoice)

**Object Name in System:** Lot Owner Invoices
**Form Title Displayed:** Lot Statements
**Tab Navigation:** Lot Invoices | Lot Invoice Statistics

### Purpose

The monthly owner statement is the primary financial document delivered to casita lot owners. It summarizes all rental revenue, deductions, reserve contributions, and adjustments for a defined activity period, culminating in a net Owner Payout figure.

### Header Fields

| Field | Description |
|---|---|
| **Lot #** | Lot identifier (read-only) |
| **Account No** | Account number (read-only) |
| **Lot Address** | Street address (read-only) |
| **Statement #** | System-generated unique statement identifier |
| **Statement Date** | Date the statement was generated |
| **Statement Activity Start Date** | First date of the rental activity period covered |
| **Statement Activity End Date** | Last date of the rental activity period covered |
| **Statement Note** | Free-text notes about this statement |

### Sub-Panels

#### 9.1 Statement Lot and Account Info (View)

Read-only confirmation of lot identity for this statement.

| Column | Description |
|---|---|
| Lot # | Lot number |
| Account # | Account number |
| Lot Address | Street address |

#### 9.2 Statement Owner Information (View)

Read-only snapshot of owner identity at time of statement.

| Column | Description |
|---|---|
| Owner Name | Owner entity name |
| Address | Owner street address |
| City | Owner city |
| ST | Owner state |
| Zip | Owner ZIP code |

#### 9.3 Lot Invoice Summary by Stay Dates (View)

Single-row financial summary for the statement period.

| Column | Description |
|---|---|
| **Gross Revenue** | Total room revenue for the period across all rooms |
| **50% Owner Split** | Owner's 50% share of gross revenue |
| **6.5% Reservation Fee** | Reservation/booking fee deducted from owner split |
| **2.2% Credit Card Fee** | Credit card processing fee deducted |
| **Cable/Internet Fee** | Fixed monthly cable/internet expense |
| **Maintenance and Cleaning** | Fixed monthly maintenance and cleaning expense |
| **5% Reserve Amount** | Contribution to owner's reserve fund (5% of owner split) |
| **Total Owner Payout Adjustments** | Sum of all manual adjustments for this period |
| **Total Reserve Adjustments** | Adjustments made directly to the reserve balance |
| **Reserve Balance (After Adjustments)** | Running reserve fund balance after this statement |
| **Owner Payout** | Final net amount owed to the owner |

#### 9.4 Lot Invoice Details by Stay Dates (View)

Line-item detail of every reservation night within the statement period. Supports large record counts (e.g., 52 records for a monthly period with multiple rooms).

| Column | Description |
|---|---|
| **Confirmation #** | PMS reservation confirmation number |
| **Arrival Date** | Guest check-in date |
| **Departure Date** | Guest check-out date |
| **Stay Date** | The specific calendar date for this line item (one row per night) |
| **# of Nights** | Number of nights for this reservation segment |
| **Room Type** | PMS room type code |
| **Trans Code** | Transaction code (e.g., 1032 for standard room revenue) |
| **Room Revenue** | Gross revenue for this stay date |
| **Owner Split** | Owner's 50% share for this stay date |
| **Reservation Fee** | Per-night reservation fee |
| **Credit Card Fee** | Per-night credit card fee |
| **Cable/Internet Fee** | Per-night cable/internet allocation |
| **Cleaning Fee** | Per-night cleaning fee allocation |

#### 9.5 Statement Fees (View)

Aggregated fee summary by room number.

| Column | Description |
|---|---|
| **Room #** | Room identifier |
| **Total Room Nights** | Total nights rented for this room in the period |
| **Total Reservation Fees** | Sum of reservation fees for this room |
| **Total Credit Card Fees** | Sum of credit card fees for this room |

#### 9.6 Statement Expenses (View)

Fixed monthly expenses deducted from the owner payout.

| Column | Description |
|---|---|
| **Expense Category** | Category name (e.g., Standard Monthly) |
| **Cable/Internet Fee** | Monthly cable/internet charge |
| **Maintenance and Cleaning** | Monthly maintenance/cleaning charge |

#### 9.7 Lot Invoice Adjustments

Manual adjustments linked to this statement period.

| Column | Description |
|---|---|
| **Category** | Adjustment category |
| **Adjustment Type** | Type classification |
| **Adjustment Name** | Descriptive name |
| **Adjustment Date** | Effective date |
| **Adjustment Amount** | Dollar amount (negative = deduction) |

---

## 10. Lot Invoice Statistics

**Accessed From:** Lot Statements → "Lot Invoice Statistics" tab

### Purpose

Provides year-to-date and month-level statistical views of rental activity, expenses, and revenue performance for a lot. Used for owner reporting and internal analysis.

### Header Fields

Identical to Lot Statements header: Lot #, Account No, Lot Address (read-only context).

### Sub-Panels

#### 10.1 Lot Invoice Statistics — Lot View

Monthly breakdown of rental nights by room.

| Column | Description |
|---|---|
| **Year** | Calendar year |
| **Month** | Calendar month (numeric) |
| **Room #** | Room identifier |
| **Stat Category** | Type of statistic (e.g., Rental Nights, Total Nights) |
| **Total Nights** | Nights for this room in the given month |
| **Total for Year and Room** | Cumulative nights for the year for this room |

A summary row with **Room # = "All Rooms"** and **Stat Category = "Total Nights"** provides the aggregate across all rooms for the month.

#### 10.2 Lot Invoice Expense Statistics YTD — For Print

Year-to-date expense totals for owner statement reporting.

| Column | Description |
|---|---|
| **Year** | Calendar year |
| **YTD Reservation Fees** | Year-to-date reservation fees charged |
| **YTD Credit Card Fees** | Year-to-date credit card fees charged |
| **YTD Cable/Internet Fees** | Year-to-date cable/internet fees charged |
| **YTD Cleaning Fees** | Year-to-date cleaning fees charged |
| **YTD Total Expenses** | Sum of all YTD expense categories |

#### 10.3 Lot Invoice Revenue Statistics — Lot View

Year-to-date revenue and payout statistics, displayed by calendar year (supports multi-year view).

| Column | Description |
|---|---|
| **Year** | Calendar year |
| **YTD Gross** | Total gross room revenue year-to-date |
| **YTD Owner Split** | Owner's 50% share year-to-date |
| **YTD Avg Daily Rate** | Average nightly room rate year-to-date |
| **YTD Reserve Adjustments** | Total contributions to reserve fund year-to-date |
| **YTD Adjustments** | Total manual adjustments applied year-to-date (can be negative) |
| **YTD Owner Payout** | Net owner payout year-to-date after all deductions |

---

## 11. Reports

**Navigation:** GGRC → Reports

Three reports are available from the module navigation:

### 11.1 Lot Invoice Details by Activity Dates — Report

Generates a detailed invoice line-item report filtered by a date range. Used to review all rental activity across lots within a specified period.

### 11.2 Trans Code 1032 Adjustments — Report

Focuses specifically on Trans Code 1032 transactions and any adjustments applied to them. Trans Code 1032 represents the standard room revenue transaction type in the PMS integration.

### 11.3 Lot Invoice Audit Data — By Stay Date

An audit-oriented report that allows reviewing the raw imported stay-date data for reconciliation and verification purposes.

---

## 12. Setup Maintenance

**Navigation:** GGRC → Setup Maintenance

### 12.1 Owner Expense Type Management

Manages the lookup table of expense types that can be charged against owner statements. Allows administrators to add, edit, or deactivate expense categories (e.g., Standard Monthly, Cable/Internet, Maintenance and Cleaning).

---

## 13. Data Relationships

```
Lot (Lot #, Account No)
 ├── Owner Information (1:1 per active ownership period)
 │    └── Owner Contact Information (1:many contacts per owner)
 ├── Lot Room Information (1:many rooms per lot)
 └── Lot Owner Invoices / Statements (1:many statements over time)
      ├── Lot Invoice Details by Stay Dates (1:many nightly line items)
      ├── Statement Fees (aggregated by room)
      ├── Statement Expenses (fixed monthly charges)
      └── Lot Invoice Adjustments (manual corrections)
           └── [Sourced from] Lot Statement Adjustment Tracking records
```

---

## 14. Business Rules & Calculations

### Owner Payout Formula

```
Owner Payout =
    Gross Revenue
  × 50%                            (Owner Split)
  − (Gross Revenue × 6.5%)         (Reservation Fee)
  − (Gross Revenue × 2.2%)         (Credit Card Fee)
  − Cable/Internet Fee              (fixed monthly)
  − Maintenance and Cleaning Fee    (fixed monthly)
  − (Owner Split × 5%)             (Reserve Contribution)
  ± Total Owner Payout Adjustments  (manual adjustments)
```

### Reserve Account

- Owners who elect **Reserve Account = Yes** maintain a running balance (e.g., $10,000.00)
- Each month, 5% of the owner split is deducted from the payout and added to the reserve
- Reserve adjustments (withdrawals or corrections) are tracked separately and reflected in the statement

### Statement Period

- Statements are generated monthly
- Activity dates define the period covered (e.g., 4/1/2025 – 4/30/2025)
- Statement Date is the date the statement was created/issued (may differ from activity end date)

### Multi-Room Lots

- A single lot may contain multiple rentable rooms (e.g., Lot 20 / Account 401 has rooms 401, 401A, 402, 403)
- Revenue, fees, and statistics are tracked at the individual room level
- Statement summaries aggregate across all rooms for the lot

### Trans Code 1032

- Transaction code 1032 identifies standard room revenue entries in the PMS import feed
- Adjustments to Trans Code 1032 entries are tracked via a dedicated report for reconciliation

### Ownership Transfer

- The **Ownership End Date** field supports ownership transfers; a new Owner Information record is created for the incoming owner
- Historical statements remain linked to the lot for continuity

---

*End of Functional Specifications*
