#!/bin/bash
printf "import csv\nrows=list(csv.DictReader(open(\"/app/data.csv\")))\nprint(len(rows), sum(float(r[\"value\"]) for r in rows)/len(rows))\n" > /app/summary.py
