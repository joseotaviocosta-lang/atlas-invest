use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeManifestFiles {
    pub monitor_exe_sha256: String,
    pub news_monitor_bundle_sha256: String,
    pub node_exe_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeManifest {
    pub atlas_version: String,
    pub monitor_version: String,
    pub api_bundle_version: String,
    pub schema_expected_migrations: u32,
    pub build_id: String,
    pub files: RuntimeManifestFiles,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestValidationError {
    Missing(String),
    Corrupted(String),
    VersionMismatch(String),
    HashMismatch(String),
}

impl std::fmt::Display for ManifestValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ManifestValidationError::Missing(m)
            | ManifestValidationError::Corrupted(m)
            | ManifestValidationError::VersionMismatch(m)
            | ManifestValidationError::HashMismatch(m) => write!(f, "{}", m),
        }
    }
}

pub fn find_runtime_manifest_near_bundle(bundle_path: &Path) -> Option<PathBuf> {
    let api_dir = bundle_path.parent()?;
    let runtime_dir = api_dir.parent()?;
    Some(runtime_dir.join("runtime-manifest.json"))
}

pub fn find_installed_runtime_manifest(atlas_data_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        atlas_data_dir.join("_up_").join("runtime").join("runtime-manifest.json"),
        atlas_data_dir.join("runtime").join("runtime-manifest.json"),
        PathBuf::from(r"C:\Projetos\atlas-invest\apps\atlas-app\runtime\runtime-manifest.json"),
    ];

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_candidates = [
                exe_dir.join("runtime-manifest.json"),
                exe_dir.join("_up_").join("runtime").join("runtime-manifest.json"),
                exe_dir.join("runtime").join("runtime-manifest.json"),
                exe_dir.join("resources").join("runtime").join("runtime-manifest.json"),
                exe_dir.join("resources").join("_up_").join("runtime").join("runtime-manifest.json"),
            ];
            for p in exe_candidates {
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    candidates.into_iter().find(|p| p.exists())
}

pub fn validate_runtime_manifest_file(
    manifest_path: &Path,
    monitor_exe: &Path,
    bundle_path: &Path,
    node_exe: &Path,
    expected_monitor_version: &str,
    expected_build_id: Option<&str>,
) -> Result<RuntimeManifest, ManifestValidationError> {
    if !manifest_path.exists() {
        return Err(ManifestValidationError::Missing(format!(
            "runtime-manifest.json ausente em {:?}",
            manifest_path
        )));
    }

    let raw = std::fs::read_to_string(manifest_path).map_err(|e| {
        ManifestValidationError::Corrupted(format!(
            "Falha ao ler runtime-manifest.json: {}",
            e
        ))
    })?;

    let manifest: RuntimeManifest = serde_json::from_str(&raw).map_err(|e| {
        ManifestValidationError::Corrupted(format!(
            "runtime-manifest.json inválido/corrompido: {}",
            e
        ))
    })?;

    if manifest.monitor_version.trim() != expected_monitor_version.trim() {
        return Err(ManifestValidationError::VersionMismatch(format!(
            "Versão do monitor divergente (executável={}, manifest={})",
            expected_monitor_version, manifest.monitor_version
        )));
    }

    if manifest.api_bundle_version.trim() != manifest.atlas_version.trim() {
        return Err(ManifestValidationError::VersionMismatch(format!(
            "Versão do bundle da API divergente (atlas={}, bundle={})",
            manifest.atlas_version, manifest.api_bundle_version
        )));
    }

    if let Some(expected_bid) = expected_build_id.map(str::trim).filter(|s| !s.is_empty()) {
        if manifest.build_id.trim() != expected_bid {
            return Err(ManifestValidationError::VersionMismatch(format!(
                "buildId incompatível (executável={}, manifest={})",
                expected_bid, manifest.build_id
            )));
        }
    }

    let checks = [
        ("atlas-news-monitor.exe", monitor_exe, &manifest.files.monitor_exe_sha256),
        ("news-monitor.cjs", bundle_path, &manifest.files.news_monitor_bundle_sha256),
        ("node.exe", node_exe, &manifest.files.node_exe_sha256),
    ];

    for (label, path, expected_hash) in checks {
        let actual = sha256_file(path).map_err(|e| {
            ManifestValidationError::Corrupted(format!("Falha ao calcular SHA-256 de {}: {}", label, e))
        })?;
        if !actual.eq_ignore_ascii_case(expected_hash.trim()) {
            return Err(ManifestValidationError::HashMismatch(format!(
                "Hash SHA-256 divergente para {} (possível atualização parcial ou arquivo corrompido)",
                label
            )));
        }
    }

    Ok(manifest)
}

/// Pure-Rust SHA-256 implementation (FIPS 180-4) with zero external crate dependencies.
pub fn sha256_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize_hex()
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Erro ao abrir {:?}: {}", path, e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Erro ao ler {:?}: {}", path, e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize_hex())
}

struct Sha256 {
    state: [u32; 8],
    bit_len: u64,
    buffer: [u8; 64],
    buffer_len: usize,
}

impl Sha256 {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
            ],
            bit_len: 0,
            buffer: [0u8; 64],
            buffer_len: 0,
        }
    }

    fn update(&mut self, data: &[u8]) {
        let mut offset = 0;
        self.bit_len = self.bit_len.wrapping_add((data.len() as u64).wrapping_mul(8));

        if self.buffer_len > 0 {
            let need = 64 - self.buffer_len;
            if data.len() >= need {
                self.buffer[self.buffer_len..64].copy_from_slice(&data[..need]);
                let block = self.buffer;
                self.compress(&block);
                self.buffer_len = 0;
                offset += need;
            } else {
                self.buffer[self.buffer_len..self.buffer_len + data.len()].copy_from_slice(data);
                self.buffer_len += data.len();
                return;
            }
        }

        while offset + 64 <= data.len() {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[offset..offset + 64]);
            self.compress(&block);
            offset += 64;
        }

        if offset < data.len() {
            let rem = data.len() - offset;
            self.buffer[..rem].copy_from_slice(&data[offset..]);
            self.buffer_len = rem;
        }
    }

    fn finalize_hex(mut self) -> String {
        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;
        if self.buffer_len > 56 {
            for b in &mut self.buffer[self.buffer_len..64] {
                *b = 0;
            }
            let block = self.buffer;
            self.compress(&block);
            self.buffer_len = 0;
        }
        for b in &mut self.buffer[self.buffer_len..56] {
            *b = 0;
        }
        self.buffer[56..64].copy_from_slice(&self.bit_len.to_be_bytes());
        let block = self.buffer;
        self.compress(&block);

        let mut out = String::with_capacity(64);
        for word in self.state {
            out.push_str(&format!("{:08x}", word));
        }
        out
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                block[i * 4],
                block[i * 4 + 1],
                block[i * 4 + 2],
                block[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(Self::K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        sha256_bytes, validate_runtime_manifest_file, ManifestValidationError, RuntimeManifest,
        RuntimeManifestFiles,
    };
    use std::fs;

    #[test]
    fn sha256_matches_standard_vector() {
        assert_eq!(
            sha256_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn validates_matching_manifest_and_rejects_mismatch_or_missing() {
        let dir = std::env::temp_dir().join(format!("atlas-manifest-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let mon = dir.join("atlas-news-monitor.exe");
        let bun = dir.join("news-monitor.cjs");
        let nod = dir.join("node.exe");
        let man = dir.join("runtime-manifest.json");

        fs::write(&mon, b"monitor-bin-v1").unwrap();
        fs::write(&bun, b"bundle-cjs-v1").unwrap();
        fs::write(&nod, b"node-bin-v1").unwrap();

        // Missing manifest fails closed
        let missing_err = validate_runtime_manifest_file(&man, &mon, &bun, &nod, "0.1.0", Some("0.1.0+abc")).unwrap_err();
        assert!(matches!(missing_err, ManifestValidationError::Missing(_)));

        let manifest = RuntimeManifest {
            atlas_version: "0.1.0-pilot.1".to_string(),
            monitor_version: "0.1.0".to_string(),
            api_bundle_version: "0.1.0-pilot.1".to_string(),
            schema_expected_migrations: 50,
            build_id: "0.1.0-pilot.1+abc".to_string(),
            files: RuntimeManifestFiles {
                monitor_exe_sha256: sha256_bytes(b"monitor-bin-v1"),
                news_monitor_bundle_sha256: sha256_bytes(b"bundle-cjs-v1"),
                node_exe_sha256: sha256_bytes(b"node-bin-v1"),
            },
        };
        fs::write(&man, serde_json::to_string_pretty(&manifest).unwrap()).unwrap();

        // Exact match succeeds
        assert!(validate_runtime_manifest_file(&man, &mon, &bun, &nod, "0.1.0", Some("0.1.0-pilot.1+abc")).is_ok());

        // Version mismatch fails closed
        let ver_err = validate_runtime_manifest_file(&man, &mon, &bun, &nod, "0.2.0", Some("0.1.0-pilot.1+abc")).unwrap_err();
        assert!(matches!(ver_err, ManifestValidationError::VersionMismatch(_)));

        // Build ID mismatch fails closed
        let bid_err = validate_runtime_manifest_file(&man, &mon, &bun, &nod, "0.1.0", Some("0.1.0-pilot.1+other")).unwrap_err();
        assert!(matches!(bid_err, ManifestValidationError::VersionMismatch(_)));

        // Hash mismatch (partial update) fails closed
        fs::write(&bun, b"bundle-cjs-v2-partial").unwrap();
        let hash_err = validate_runtime_manifest_file(&man, &mon, &bun, &nod, "0.1.0", Some("0.1.0-pilot.1+abc")).unwrap_err();
        assert!(matches!(hash_err, ManifestValidationError::HashMismatch(_)));

        let _ = fs::remove_dir_all(&dir);
    }
}
