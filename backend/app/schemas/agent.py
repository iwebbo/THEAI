from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

_MAX_INT = 2 ** 62


class EnrollRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    hostname: str = Field(default="", max_length=255)
    os: str = Field(default="", max_length=32)
    arch: str = Field(default="", max_length=32)
    agent_version: str = Field(default="", max_length=64)


class DiskInfo(BaseModel):
    mount: str = Field(max_length=255)
    device: str = Field(default="", max_length=255)
    fs: str = Field(default="", max_length=64)
    total: int = Field(ge=0, le=_MAX_INT)
    used: int = Field(ge=0, le=_MAX_INT)


class HeartbeatRequest(BaseModel):
    cpu_percent: Optional[float] = Field(default=None, ge=0, le=100)
    mem_total: int = Field(default=0, ge=0, le=_MAX_INT)
    mem_used: int = Field(default=0, ge=0, le=_MAX_INT)
    swap_total: int = Field(default=0, ge=0, le=_MAX_INT)
    swap_used: int = Field(default=0, ge=0, le=_MAX_INT)
    load1: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    load5: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    load15: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    uptime_seconds: int = Field(default=0, ge=0, le=_MAX_INT)
    net_rx_bytes: int = Field(default=0, ge=0, le=_MAX_INT)
    net_tx_bytes: int = Field(default=0, ge=0, le=_MAX_INT)
    disks: List[DiskInfo] = Field(default_factory=list, max_length=64)
    inventory_hash: str = Field(default="", max_length=128)
    agent_version: str = Field(default="", max_length=64)

    @field_validator("disks", mode="before")
    @classmethod
    def _disks_none_to_list(cls, v):
        return [] if v is None else v


class OSInfo(BaseModel):
    family: str = Field(default="", max_length=32)
    id: str = Field(default="", max_length=64)
    version_id: str = Field(default="", max_length=64)
    pretty: str = Field(default="", max_length=255)
    kernel: str = Field(default="", max_length=255)
    arch: str = Field(default="", max_length=32)


class PackageInfo(BaseModel):
    name: str = Field(max_length=255)
    version: str = Field(max_length=255)
    source: str = Field(default="", max_length=255)
    source_version: str = Field(default="", max_length=255)
    arch: str = Field(default="", max_length=32)


class InventoryRequest(BaseModel):
    pkg_hash: str = Field(min_length=1, max_length=128)
    os: OSInfo
    packages: List[PackageInfo] = Field(default_factory=list, max_length=60000)

    @field_validator("packages", mode="before")
    @classmethod
    def _packages_none_to_list(cls, v):
        return [] if v is None else v


class PortInfo(BaseModel):
    proto: str = Field(max_length=8)
    address: str = Field(default="", max_length=128)
    port: int = Field(ge=0, le=65535)
    process: str = Field(default="", max_length=128)


class PortsRequest(BaseModel):
    ports: List[PortInfo] = Field(default_factory=list, max_length=5000)

    @field_validator("ports", mode="before")
    @classmethod
    def _ports_none_to_list(cls, v):
        return [] if v is None else v
