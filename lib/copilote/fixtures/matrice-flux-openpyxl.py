"""Regenerates matrice-flux-openpyxl.xlsx, the fixture for the Excel loader test.

A flow matrix as openpyxl writes it: a "Procédure" sheet and a "Flux" sheet, merged
title and column-group cells above the header, and an Excel table on "Flux" (openpyxl
writes absolute relationship targets, which made exceljs throw).

    python3 lib/copilote/fixtures/matrice-flux-openpyxl.py lib/copilote/fixtures/matrice-flux-openpyxl.xlsx
"""
import sys

import openpyxl
from openpyxl.styles import Font
from openpyxl.worksheet.table import Table, TableStyleInfo

wb = openpyxl.Workbook()
p = wb.active
p.title = "Procédure"
p["A1"] = "Matrice des flux — Procédure"
p.merge_cells("A1:D1")
p["A1"].font = Font(bold=True)
p.append(["Étape", "Acteur", "Action", "Délai"])
for i in range(1, 6):
    p.append([i, f"Acteur {i}", f"Action {i}", f"J+{i}"])

f = wb.create_sheet("Flux")
f["A1"] = "Flux"
f.merge_cells("A1:C1")
f["D1"] = "Volumétrie"
f.merge_cells("D1:E1")
f.append(["Source", "Cible", "Protocole", "Fréquence", "Volume"])
for i in range(1, 51):
    f.append([f"SRC{i}", f"TGT{i}", "SFTP", "Quotidien", i * 10])
table = Table(displayName="TFlux", ref="A2:E52")
table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium9", showRowStripes=True)
f.add_table(table)
f.print_title_rows = "1:2"

wb.save(sys.argv[1])
