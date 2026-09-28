"""외부 모델 없이 도는 해시 임베더. 연관 기억 검색이 단어 겹침 수준으로만 동작한다.

더 나은 검색이 필요하면 sentence-transformers 로 바꾼다 (torch 설치가 필요하다):
  st = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")
  embedder = lambda text: st.encode(text, show_progress_bar=False)
"""

import hashlib
import re

import numpy as np

_DIMENSIONS = 512


def embed(text: str) -> np.ndarray:
  vector = np.zeros(_DIMENSIONS)
  for token in re.findall(r"\w+", text.lower()):
    digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
    vector[int.from_bytes(digest) % _DIMENSIONS] += 1.0
  norm = np.linalg.norm(vector)
  return vector / norm if norm else vector
