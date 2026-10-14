import httpx


class Supabase:
    """The few Supabase calls the worker makes, over plain HTTP with the service key."""

    def __init__(self, url: str, service_key: str, timeout: float = 120.0):
        headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self.http = httpx.Client(base_url=url.rstrip("/"), headers=headers, timeout=timeout)

    def rpc(self, fn: str, args: dict):
        r = self.http.post(f"/rest/v1/rpc/{fn}", json=args)
        r.raise_for_status()
        return r.json() if r.content else None

    def push_token(self, user_id: str) -> str | None:
        r = self.http.get("/rest/v1/profiles", params={"id": f"eq.{user_id}", "select": "push_token"})
        r.raise_for_status()
        rows = r.json()
        return rows[0].get("push_token") if rows else None

    def download(self, bucket: str, path: str, dest: str) -> None:
        with self.http.stream("GET", f"/storage/v1/object/{bucket}/{path}") as r:
            r.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in r.iter_bytes(1 << 20):
                    fh.write(chunk)

    def upload(self, bucket: str, path: str, src: str, content_type: str) -> None:
        with open(src, "rb") as fh:
            r = self.http.post(
                f"/storage/v1/object/{bucket}/{path}",
                content=fh.read(),
                headers={"Content-Type": content_type, "x-upsert": "true"},
            )
        r.raise_for_status()

    def remove(self, bucket: str, paths: list[str]) -> None:
        r = self.http.request("DELETE", f"/storage/v1/object/{bucket}", json={"prefixes": paths})
        r.raise_for_status()
