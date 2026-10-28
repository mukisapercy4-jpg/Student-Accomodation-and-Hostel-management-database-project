import logging

from django.db import DatabaseError, IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """DRF handler that turns raw database errors into safe API responses."""
    response = exception_handler(exc, context)
    if response is not None:
        return response

    if isinstance(exc, IntegrityError):
        logger.warning("Integrity error: %s", exc)
        return Response(
            {"detail": "The request conflicts with existing data "
                       "(duplicate value or a record that is still in use)."},
            status=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, DatabaseError):
        logger.exception("Database error")
        return Response(
            {"detail": "A database error occurred. The request was not saved."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return None
