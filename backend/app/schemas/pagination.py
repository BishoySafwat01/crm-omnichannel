import math
from typing import Any, Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def create(
        cls, items: list[T], total: int, page: Any = 1, page_size: Any = 20
    ) -> "PaginatedResponse[T]":
        try:
            p = int(getattr(page, "default", page) if page is not None else 1)
        except (ValueError, TypeError):
            p = 1
        try:
            ps = int(getattr(page_size, "default", page_size) if page_size is not None else 20)
        except (ValueError, TypeError):
            ps = 20
        p = max(1, p)
        ps = max(1, ps)
        total_pages = math.ceil(total / ps) if ps > 0 else 0
        return cls(
            items=items,
            total=total,
            page=p,
            page_size=ps,
            total_pages=total_pages,
        )
