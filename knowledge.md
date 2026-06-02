I want to create a new task first. I'd like a program to calculate the working time based on item codes, referencing various time data sources, such as those used in SharePoint setup.



To ensure your Claude Code or system can accurately calculate operating hours (Standard Hours) from the Item Code, I have designed the program structure based on the logic from the EN-T-001 manual,
and the standard time data from SAP Routing that we analyzed together.
Program Structure for Time Calculation (Python Logic)

Key elements the program must use (Technical Metadata)
kVA calculation: The program must use the formula DEF × 10
C
= VA
If the Item Code is in the wrong position, the kVA result will be incorrect immediately.
Mapping the MP5304 work center: Approximately 3.69 hours must always be included in the Tank Body department for large transformers. To ensure the numbers in the Heat Map are accurate (94% accuracy) [Turns 18-19, 51-57]:
Cast Resin (Type 4) Condition: If tr_type is 4, the program must add time for the "Cast Resin Preparation" (EE3403) and "Copper Bar Assembly" activities because the process differs from oil-filled transformers.
Special Control (Group S): If digit 9 is 'S', always add 40 hours for the Special Control Wiring circuit.
Additional Recommendation:
To make this program work with constantly updated data, it is recommended to retrieve the STDActivityType3 (Standard Labor Hours) values ​​from the SAP_Routing.csv file.
Use this as a central database so the program can access them by MaterialOrder code instead of using hard-coded constants in the program. [Turn 26]

2. Details of the Differences in Production Flow and Standard Time
Each type of transformer has a distinctly different operating flow and duration. The program should be divided into the following cases:
A. General Oil-Filled Transformer Group (Type 1, 2, 3)
Small/Medium (<= 1000kVA):
Assembly: Coil installation and steel insertion time is approximately 1.75 - 2.75 hours. [Turn 23]
Testing: Ratio Test 0.25 hours and Routine Test 1.0 hour.
Large (1250kVA - 3500kVA):
Assembly: Additional coil installation preparation steps (4 hours), totaling approximately 11 hours for coil installation and steel insertion. [Turn 23]
Testing: Longer testing time (Ratio 2 hours / Routine 2 hours). [90, Turn 24]
Tank Body: The MP5304 activity (equipment preparation) of approximately 3.69 hours must be included in the tank body department for 94% accuracy. [Turn 18-19]
B. Cast Transformer Group Resin (Type 4)
The flow will be completely different from oil-filled transformers (no oil tank/filling work):
Iron arrangement: Up to 20 hours for 1000kVA models.
Cast Resin preparation (EE3403): Includes "iron head dismantling" (2.25-3.5 hours) and "copper bar assembly" (1 hour) steps, replacing oil line connection work.
C. Extra Large Power Transformers (kVA >= 7000 or Power TR)
Assembly Block: Uses work code PT3701, contracted for the entire block, approximately 104.62 hours [Turn 19]
Control Wiring: For complex models (e.g. Linde), there will be special control circuit work up to 40 hours.
Total time: Up to 212.5 hours per unit [Turn 19]

--------------------------------------------------------------------------------
Technical Specification: Item Code & Production Logic Manual
This manual outlines the critical technical parameters derived from the Transformer Item Manual (EN-T-001) and SAP Routing data. These rules are essential for accurate lead time estimation and production scheduling.
1. Design Status & Engineering Lead Time
The STATUS flag determines the initial delay before production can commence:
STATUS = Y (Ready): The design is complete. Production orders (S/O) can be opened and work starts immediately
.
STATUS = N (New Design): No existing design. Engineering requires 15 days for a new design before production begins
.
STATUS = DCR (Revision): Design exists but requires modification. Engineering requires 7 days lead time
.
Developer Note: The program must add these days to the total manufacturing lead time.
2. Factory Location (Manufacturing Site)
The code at Digit B specifies where the unit will be produced:
Codes 1, 2, 3, 4, 5: Standard production at the Main Factory
.
Codes P, Q, R, W, T, U: Production at the Thepharak Factory
.
Developer Note: Different sites may have different Work Centers (WC) or standard hour metrics.
3. Guaranteed Loss Standards (Efficiency)
The Item Code dictates the efficiency criteria used during the Testing phase (Ratio & Routine Tests):
High Loss Models: Codes C, N, or F indicate high-loss variants of Conservator, N2 Sealed, and Hermetically Sealed types, respectively
.
Utility Standards (Group I):
E = PEA Standard (Provincial Electricity Authority)
.
I = MEA Standard (Metropolitan Electricity Authority)
.
Low Loss Criteria: Units explicitly marked as "Low Loss" must have a Total Loss below 1% of the rated capacity
.
4. Special Modifications & Add-ons (ZP17)
Digits I, J, or S indicate modifications that trigger additional assembly time:
Code S: Indicates a Special Modification (e.g., adding a Cable Box or converting a "Fully with Oil" unit to "Conservator" type)
.
Time Impacts:
External Cable Box: Add approx. 8 hours
.
Special Control Wiring: Add between 8 to 40 hours depending on complexity
.
5. Winding Material & Process (ZP12)
Codes in Group I define the material and winding style, which directly impacts the Coil Winding duration:
Foil Winding (A, E, I): Typically used for standard Foil models (Copper or Aluminum)
.
Wire Winding (C, F, J): Standard wire-wound coils
.
Aluminum Material:
H = HV Winding is Aluminum
.
L = Both HV and LV Windings are Aluminum
.
Developer Note: Aluminum winding models in SAP Routing often show different Standard Hours (STDActivityType3) compared to Copper models.

--------------------------------------------------------------------------------
Summary of Metadata Requirements for Programming
To ensure the calculator reflects reality, the following "Flags" must be included in the program's metadata:
Design_Flag (Y/N/DCR): To calculate the actual start date based on engineering lead time.
Factory_Flag (Main/Thepharak): To route the order to the correct Work Center database.
Material_Flag (Copper/Aluminum): To adjust standard hours for the ZP12 (Coil Winding) process.
Special_AddOn_Flag (S): To automatically trigger additional time buffers for ZP17 activities (Cabling/Box/Control).
Efficiency_Flag (Std/High/Low/PEA/MEA): To set the pass/fail thresholds for Routine Testing
.

1. Item Code Parser (Technical Metadata)
The program must first slice the Item Code (Format: AB CDEF GHIJKL) to extract technical attributes
:
Capacity Calculation (Digits C, DEF): Use the formula VA=DEF×10 
C
  to determine kVA
.
Example: 3160 →160×10 
3
 =160,000 VA (160 kVA)
.
Example: 4250 →250×10 
4
 =2,500,000 VA (2500 kVA)
.
Transformer Type (Digit B): Determines the Production Flow and mandatory Work Centers (WC)
.
1 or C: Conservator Type (adds oil conservator installation time).
3 or F: Hermetically Sealed (requires vacuum/sealing time).
4: Cast Resin (uses dry-type assembly flow).
Characteristics (Digit I): Triggers specific time modifiers
.
S: Special modification. Triggers additional ZP17/Finishing time for Cable Boxes or Control Wiring
.
H or L: Aluminum Winding. Adjusts the Standard Hours for the Coil Winding (ZP12) process
.

--------------------------------------------------------------------------------
2. Production Flow & Standard Hour Variability
Production flows differ significantly based on the transformer's physical construction and capacity:
Flow A: Standard Oil-Immersed Transformers (Types 1, 2, 3)
Small/Medium (≤ 1000 kVA):
Assembly (ZP16): Standard coil loading and core insertion takes approximately 1.75 to 2.75 hours
.
Testing: Ratio Test (WC EE4201) takes 0.25 hours, and Routine Test (WC EE4202) takes 1.0 hour
.
Large (1250 kVA - 3500 kVA):
Assembly (ZP16): Includes a specialized "Setup" stage (4 hrs). Total assembly time (loading + insertion) reaches ~11 hours [Conversation History, 423].
Testing: Durations increase to 2.0 hours for Ratio and 2.0 hours for Routine tests
.
Tank Body (ZP14): Program must include WC MP5304 (Accessory Prep) work (~3.69 hrs) under the Tank Body department for heat map accuracy [41, 110, 131, Conversation History].
Flow B: Cast Resin Transformers (Type 4)
This flow skips oil-related steps and uses unique assembly procedures:
Core Stacking (ZP11): Significantly more complex; a 1000 kVA unit requires 20 hours for stacking
.
Assembly (ZP16 - WC EE3403): Replaces standard assembly WC. Steps include "Head Removal" (รื้อหัวเหล็ก) (2.25–3.5 hrs) and "Copper Bar Installation" (1 hr) instead of oil-submerged cabling
.
Flow C: High-Capacity Power Transformers (kVA ≥ 7000)
Consolidated Assembly: Uses PT3701 to handle all assembly, tanking, and filling as a single block. A Linde 7000 kVA unit requires 104.62 assembly hours [100, 318, 455, Conversation History].
Control Wiring: Often includes specialized circuits taking up to 40 hours at WC EE3401
.

--------------------------------------------------------------------------------
3. Metadata Requirements for Program Logic
Required Data
Primary Source
Programmatic Function
VA Formula
EN-T-001 Ch. 4
Converts Digits CDEF into numerical kVA for bucket sorting
.
Flow Selection
Digit B (Type)
Switches between Oil Flow vs. Cast Resin Flow logic
.
Time Modifiers
Digit I (Group S)
Adds 8 hrs for Cable Boxes or 40 hrs for Special Control
.
WC Mapping
SAP_Employee.csv
Reassigns MP5304 from "OTHER" to "TANK BODY" for better metrics [Conversation History].
Design Lead Time
Manual Ch. 1
Adds 7–15 days to the start date if Design Status is N or DCR
.
Recommendation for Implementation
The program should use a Layered Calculation approach:
Base Time: Set standard hours based on the kVA bucket.
Type Adjustment: Add or subtract hours based on the physical flow (e.g., Oil vs. Dry-type).
Special Buffers: Add hours for specific flags like 'S' (Special) or 'H/L' (Aluminum)
.
Engineering Delay: Append the initial design lead time based on the Design Status Flag

Beyond the basic code structures (AB CDEF GHIJKL) that we've analyzed for programming, there are in-depth details and technical conditions you need to know to ensure the highest accuracy in using Item Codes in the SAP system and production planning. These include:
1. Design Status
Chapter 1 of the manual states that using Item Codes must always be coupled with checking the STATUS in the engineering database, which affects the lead time.

STATUS = Y: The design is complete. A production order (S/O) can be opened and work can begin immediately.

STATUS = N: No design is available. The engineering department needs to design a new one. This takes approximately 15 days.

STATUS = DCR: An existing design exists but needs modification. It takes approximately 7 days.

Caution: If your time calculation program does not include design time in the N or DCR state, the actual production plan may be inaccurate.

2. Factory Location
The code in the second digit (Digit B) indicates not only the transformer type but also the manufacturing location.
:
Codes 1, 2, 3, 4, 5: These are usually standard models manufactured at the main factory.
.
Codes P, Q, R, W, T, U: These are models manufactured at... The Thepharak factory may have a different Work Center or time standards from the main factory.

3. Loss Standards
The Item Code will be the key to accessing the Guaranteed Lossses table in Chapter 2 of the manual to verify test results.
:
Code C, N, F: These are High Loss models of the Conservator, N2 Sealed, and Hermetically Sealed types, respectively.
.
Group I codes (e.g., E, I): If it is E (PEA standard) or I (MEA standard), a specific Loss table according to the criteria of that state enterprise must be used.
.
Low Loss models: If specified as Low Loss in the product description, the Total Loss criterion will be less than 1% of the rating.
.
4. Linking with... "Add-ons" (Special Add-ons)
In digits 9 and 10-12 (Digit I and JKL), these have significant meaning for assembly work:
:
Code S: Means "Additions to the original transformer" (Special Modification), such as adding a cable box, installing control wiring, or upgrading from a full oil system to a conservation system.
.
Impact on production time: When the code 'S' is found in this position, the program must immediately add time for ZP17 or other supporting activities, such as box installation (8 hours) or special control circuits (up to 40 hours).
.
5. Winding Material
The codes in Group I also indicate the material used. This affects the Coil Winding (ZP12) process:

Codes A, E, I: Usually refer to Foil coils (Copper/Aluminum).

Codes C, F, J: Refer to Wire coils.

Codes H: High-voltage aluminum coils (HV Aluminum).

i want u to make each item id have flow how to do howlong what type tranfomer what wc work on it