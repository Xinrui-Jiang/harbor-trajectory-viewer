#!/bin/bash
python /app/summary.py | grep -q "^4 11.5" && echo 1 > /logs/verifier/reward.txt || echo 0 > /logs/verifier/reward.txt
