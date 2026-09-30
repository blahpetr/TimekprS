#!/bin/sh

cd "$(dirname "$0")" || exit 1
exec uvicorn main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
