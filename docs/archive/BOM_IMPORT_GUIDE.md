# 📱 BOM Import Interface - User Guide

## Overview

The BOM Import interface is the primary feature of PCB Production Manager Phase 1. It allows you to:
1. Upload Eagle .txt BOM files
2. Automatically harmonize component values
3. Review components for manual approval
4. Save harmonized data to the database

## How to Use

### Step 1: Start the Application

**Open PowerShell or Command Prompt in the project directory:**

```bash
# Terminal 1 - Backend (keep running)
python launch.py

# Terminal 2 - Frontend (new window)
start-frontend.bat
```

This will:
- Start the API on http://localhost:8000
- Start React on http://localhost:3000
- Open your browser automatically

### Step 2: Upload a BOM File

In the browser at http://localhost:3000:

1. **Drag & Drop Method**:
   - Drag your Eagle .txt BOM file onto the upload area
   - File appears in the preview box

2. **Click to Browse**:
   - Click "Parcourir les fichiers" button
   - Select your .txt file

### Step 3: Harmonize

Click **"Importer & Harmoniser"** button

The system will:
- Parse the file (7-column format)
- Apply harmonization rules
- Display results with statistics

### Step 4: Review Results

#### Statistics Section
Shows:
- **Total Components**: How many lines were imported
- **Auto-harmonized**: Components that matched rules automatically
- **Manual Review**: Components needing your attention
- **Component Breakdown**: Resistors, Capacitors, Others

#### Warnings Section
Lists components that need verification:
- Placeholders (xxxnF, TBD)
- Non-standard values
- Unknown component types

#### Components Table
Shows for each component:
| Column | Meaning |
|--------|---------|
| Référence | Part reference on PCB (C1, R1, etc.) |
| Valeur (Brut) | Original value from Eagle export |
| Valeur (Harmonisée) | Value after applying rules |
| Footprint | PCB package size/type |
| Type | SMD or PTH (surface/through-hole) |
| Status | Auto (✓) or Manual review (⚠️) |

### Step 5: Verify Harmonization

For each component, check if:
- ✅ **Auto**: Value was correctly harmonized
- ⚠️ **Manual**: Needs manual verification

Examples:
```
✅ R1: 10 → 10R (CORRECT)
✅ C1: 22nF → 22nF (UNCHANGED)
⚠️ C4: xxxnF → xxxnF (PLACEHOLDER - needs actual value)
⚠️ IC1: LM335AM → LM335AM (UNKNOWN IC - needs verification)
```

### Step 6: Save (When Ready)

Click **"💾 Enregistrer la BOM"** to:
1. Enter a BOM name (e.g., "AMPLI_GEN6_TOP")
2. Save to the database
3. Use in Marketplace and PnP modules

## Understanding Harmonization Rules

### Resistors (R1, R2, R3...)
```
Input               → Output
10                 → 10R      (add unit)
1.5K               → 1.5K     (already correct)
r (lowercase)      → R        (fix case)
k (lowercase)      → K        (fix case)
```

### Capacitors (C1, C2, C3...)
```
Input               → Output
22nF               → 22nF     (unchanged)
f (lowercase)      → F        (fix case)
```

### Other Components (Q1, IC1, U1...)
```
⚠️ Marked for manual review
- Unknown reference types
- Complex part descriptions
- Non-standard values
```

## Common Issues & Solutions

### Issue: File not uploading
**Solution**: 
- Use .txt files only (not .csv or .xlsx)
- Check file format matches Eagle export

### Issue: Components marked for manual review
**Solution**:
- These need your verification
- Edit values in the table before saving
- (Feature coming in Phase 2)

### Issue: API connection error
**Solution**:
- Verify backend is running: `python launch.py`
- Check API is accessible: http://localhost:8000/docs

### Issue: React doesn't open
**Solution**:
- Manually open http://localhost:3000
- Check Node.js is installed: `node --version`

## File Format (Eagle .txt)

Your BOM file should be space-delimited with 7 columns:

```
Reference  Value     Footprint     X        Y        Rotation  Type
R1         10        0805          123.45   67.89    0         T
C1         22nF      0805          129.01   73.45    0         T
IC1        LM335AM   SOIC8         133.45   77.89    90        T
```

**Columns**:
1. **Reference**: Component designator (C1, R5, U1)
2. **Value**: Component value or part number
3. **Footprint**: Eagle footprint name
4. **X**: Board position X (mm)
5. **Y**: Board position Y (mm)
6. **Rotation**: Rotation angle (0, 90, 180, 270)
7. **Type**: SMD component indicator (T=top, B=bottom)

## Next Steps

Once BOM is harmonized and saved:
1. Use in **Marketplace** to create production commands
2. Plan **PnP** feeder assignments
3. Export to Excel for manufacturing

## API Documentation

For developers, API docs available at:
http://localhost:8000/docs

Example endpoints:
- `POST /api/bom/import` - Import and harmonize
- `POST /api/bom/validate` - Validate structure
- `GET /api/bom/stats` - Get capabilities info

---

**Need Help?**: Check the project README.md or PHASE1_COMPLETION.md
