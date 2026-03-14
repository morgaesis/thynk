use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub port: u16,
}

impl Default for Config {
    fn default() -> Self {
        let data_dir = PathBuf::from("./data");
        let db_path = data_dir.join("thynk.db");
        Self {
            data_dir,
            db_path,
            port: 3000,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.port, 3000);
        assert_eq!(config.data_dir, PathBuf::from("./data"));
        assert_eq!(config.db_path, PathBuf::from("./data/thynk.db"));
    }
}
