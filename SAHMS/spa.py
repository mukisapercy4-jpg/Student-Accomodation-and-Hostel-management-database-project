"""Serve the React SPA index.html for any route not handled by the API or admin."""
from pathlib import Path
from django.http import HttpResponse, Http404

_INDEX = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"


def index(request):
    try:
        return HttpResponse(_INDEX.read_text(encoding="utf-8"), content_type="text/html")
    except FileNotFoundError:
        raise Http404("Frontend not built. Run: npm run build --prefix frontend")
