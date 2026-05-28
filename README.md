# GGRC Casita Invoices — Functional Documentation

**System:** OnBase (iStrata)
**Module:** GGRC — Garden of the Gods Resort, Wellness & Club
**Purpose:** Casita lot ownership, rental income tracking, owner invoicing, and payout management

---

## Overview

The GGRC Casita Invoices module is a workflow built within the **OnBase (iStrata)** platform that manages the full lifecycle of casita lot ownership at Garden of the Gods Resort & Club in Colorado Springs, CO. Each "lot" represents a privately owned casita unit that participates in the resort's rental program. The system tracks owner details, room assignments, reservation activity, expense deductions, and monthly owner payout statements.

## Module Navigation

The GGRC module is accessible from the OnBase top navigation bar under the **GGRC** tab. The left-panel navigation is organized into three groups:

| Group | Items |
|---|---|
| **Lot and Owner Maintenance** | Lot Information, Owner Information, Lot and Associated Room Information |
| **Reports** | Lot Invoice Details by Activity Dates, Trans Code 1032 Adjustments, Lot Invoice Audit Data – By Stay Date |
| **Setup Maintenance** | Owner Expense Type Management |

---

## Documentation Index

| Document | Description |
|---|---|
| [functional-specifications.md](functional-specifications.md) | Detailed functional specs for all screens and workflows |

---

## Key Entities

| Entity | Description |
|---|---|
| **Lot** | A privately owned casita unit identified by Lot # and Account No |
| **Owner** | The legal owner or ownership entity (individual or LLC) of a lot |
| **Room** | A rentable room within a lot, assigned a Room # and Room Type |
| **Statement** | Monthly owner payout statement covering a defined activity date range |
| **Adjustment** | Manual financial correction applied to a statement (positive or negative) |
