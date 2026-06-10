# Assembly Department (แผนกประกอบภายใน) — Reference

> `AssemblyPage.tsx`  WCs: EE3301, EE3302, EE3303, EE3401, EE3402, EE3403

## Current state
Stub page — WC summary is shown via `DeptContent` in `index.tsx`.
No dedicated scheduling page yet.

## Planned structure
```
assembly/
├── AssemblyPage.tsx         ← main page
├── components/              ← reusable sub-components
├── scheduling/              ← assembly-specific scheduling engine
└── ASSEMBLY.md
```

## Notes
- Inner assembly WCs are split into two groups: EE33xx (assembly line) and EE34xx (sub-assembly)
- Planning unit is likely by order, not by kVA
