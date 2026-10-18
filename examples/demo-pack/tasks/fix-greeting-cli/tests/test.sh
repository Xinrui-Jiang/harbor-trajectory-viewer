#!/bin/bash
cd /app && pytest -q tests/test_greet.py && echo 1 > /logs/verifier/reward.txt || echo 0 > /logs/verifier/reward.txt
