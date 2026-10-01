"""Bounded warm-worker cache of evidence, keyed by household and committed revision.

Callers must still check deletion, read current permissions/actions, and reread the
incident revision before publishing a result. No decisions or approvals are cached.
"""

from collections import OrderedDict
from copy import deepcopy
from time import monotonic


class EvidenceCache:
    def __init__(self, capacity=16, ttl=60, clock=monotonic):
        self.entries = OrderedDict()
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock

    def get(self, owner, incident, revision):
        if revision is None:
            return None
        key = (owner, incident, str(revision))
        entry = self.entries.get(key)
        if entry is None:
            return None
        expires, state = entry
        if expires <= self.clock():
            self.entries.pop(key, None)
            return None
        self.entries.move_to_end(key)
        return deepcopy(state)

    def put(self, owner, incident, revision, state):
        if revision is None:
            return
        key = (owner, incident, str(revision))
        self.entries[key] = (self.clock() + self.ttl, deepcopy(state))
        self.entries.move_to_end(key)
        while len(self.entries) > self.capacity:
            self.entries.popitem(last=False)
