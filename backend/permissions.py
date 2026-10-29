from rest_framework.permissions import BasePermission

from .roles import can

METHOD_ACTION = {
    "GET": "read", "HEAD": "read", "OPTIONS": "read",
    "POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete",
}


class RolePermission(BasePermission):
    """Role-based check driven by ``view.resource`` and backend.roles.MATRIX."""

    def has_permission(self, request, view):
        resource = getattr(view, "resource", None)
        # a custom action can be guarded by a different resource than its viewset (e.g. payments/momo/)
        overrides = getattr(view, "action_resources", None) or {}
        resource = overrides.get(getattr(view, "action", None), resource)
        if resource is None:  # views that only need a logged-in user
            return bool(request.user and request.user.is_authenticated)
        action = METHOD_ACTION.get(request.method)
        # custom POST actions that change an existing record need "update", not "create"
        verbs = getattr(view, "action_verbs", None) or {}
        action = verbs.get(getattr(view, "action", None), action)
        # custom detail actions such as bookings/<id>/cancel/ count as update
        return action is not None and can(request.user, resource, action)
