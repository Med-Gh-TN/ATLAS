try:
    from fastapi_limiter.depends import RateLimiter as _RL
    def limiter(times: int, seconds: int):
        try:
            return _RL(times=times, seconds=seconds)
        except TypeError:
            try:
                return _RL(requests=times, seconds=seconds)
            except Exception:
                return lambda: None
except Exception:
    def limiter(times: int, seconds: int):
        return lambda: None
