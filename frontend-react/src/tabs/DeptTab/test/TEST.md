# Test / Outer Assembly Department (แผนกประกอบภายนอก) — Reference

> `TestPage.tsx`  WCs: EE4201, EE4202, EE4204, MP5101–MP5103, MP5202, MP5304, MP5401–MP5404, MP5601–MP5603

## Current state
Stub page — WC summary is shown via `DeptContent` in `index.tsx`.
No dedicated scheduling page yet.

## Planned structure
```
test/
├── TestPage.tsx             ← main page
├── components/              ← reusable sub-components
├── scheduling/              ← test/outer scheduling engine
└── TEST.md
```

## Notes
- Spans both EE (electrical) and MP (mechanical/painting) work centres
- Final testing and outdoor assembly steps — typically last in the production chain
