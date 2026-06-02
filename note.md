what is different between master plan and coil plan

in db coil plan collect like in database i can fix or like i import

i mead every data i import u collet right?

II. Transformer Item Code Data Logic (Manual EN-T-001)
Structure: AB CDEF GHIJKL (10 to 12 Digits)
1. Product Category (Digit A)
5: Finished Transformer
4: 90% Semi-Finished (Internal use only)
2. Transformer Type (Digit B)
Code
English Definition
1 / C
3 Ph. Conservator Type (C = High Loss)
2 / N
3 Ph. N2 Gas Sealed (N = High Loss)
3 / F
3 Ph. Hermetically Sealed - Full Oil (F = High Loss)
4
3 Ph. Cast Resin (Dry Type)
5
3 Ph. Pad Mounted
6
Dry Type (Class H, Class A)
8
Special Type
9
1 Phase
3. Capacity / kVA Logic (Digit CDEF)
Calculated as: DEF×10 
C
 =VA
C: Multiplier (Power of 10)
DEF: Base Value
Examples:
30 kVA (30,000 VA) → 2300 (300×10 
2
 )
160 kVA (160,000 VA) → 3160 (160×10 
3
 )
1000 kVA (1,000,000 VA) → 4100 (100×10 
4
 )
4. High Voltage (HV) System (Digit GH)
Code
Voltage Level
Code
Voltage Level
01
0 - 1000 V
22
22,000 V
11
11,000 V
33
33,000 - 36,000 V
19
19,000 V
40
11,000/22,000 V (Dual)
5. Product Group & Characteristics (Digit I)
Code
English Definition
A / C
Ekarat Standard (A = Foil Winding, C = Wire Winding)
E / F
PEA Standard (E = Foil Winding, F = Wire Winding)
I / J
MEA Standard (I = Foil Winding, J = Wire Winding)
S
Special Add-ons (e.g., + Cable Box, + Control Circuit)
H / L
Aluminum Winding (H = HV only, L = HV & LV)
6. Running Number (Digit J / KLM)
Sequential number to distinguish specific design variants.

--------------------------------------------------------------------------------
III. Decoding Examples for AI Training
Case 1: 51410022A1
: Finished Transformer
: 3 Ph. Conservator Type
****: 1000 kVA (100×10 
4
  VA)
: 22,000 V HV System
[A]: Ekarat Standard (Foil Winding)
: Design Sequence No. 1
Case 2: 53415022S001
: Finished Transformer
: 3 Ph. Hermetically Sealed
****: 1500 kVA (150×10 
4
  VA)
: 22,000 V HV System
[S]: Special Modification (Add Cable Box Type 1)
: Design Sequence No. 001

