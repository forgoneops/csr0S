//! Window geometry clamping. Applied at startup from the saved config.

use serde::{Deserialize, Deserializer, Serialize};

pub const DEFAULT_WIDTH: f64 = 1280.0;
pub const DEFAULT_HEIGHT: f64 = 840.0;
pub const MIN_WIDTH: f64 = 640.0;
pub const MIN_HEIGHT: f64 = 480.0;
pub const MAX_SIZE: f64 = 10000.0;
pub const MAX_POSITION: f64 = 20000.0;

/// A missing or null size becomes NaN, which `clamp` replaces by the default.
fn lenient_f64<'de, D: Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    Ok(Option::<f64>::deserialize(d)?.unwrap_or(f64::NAN))
}

fn nan() -> f64 {
    f64::NAN
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Geometry {
    #[serde(default = "nan", deserialize_with = "lenient_f64")]
    pub width: f64,
    #[serde(default = "nan", deserialize_with = "lenient_f64")]
    pub height: f64,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
}

impl Default for Geometry {
    fn default() -> Self {
        Geometry { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, x: None, y: None }
    }
}

fn clamp_size(v: f64, default: f64, min: f64) -> f64 {
    if !v.is_finite() {
        default
    } else {
        v.clamp(min, MAX_SIZE)
    }
}

/// Make any saved geometry safe to apply.
pub fn clamp(g: Geometry) -> Geometry {
    let width = clamp_size(g.width, DEFAULT_WIDTH, MIN_WIDTH);
    let height = clamp_size(g.height, DEFAULT_HEIGHT, MIN_HEIGHT);
    let (x, y) = match (g.x, g.y) {
        (Some(x), Some(y))
            if x.is_finite() && y.is_finite() && x.abs() <= MAX_POSITION && y.abs() <= MAX_POSITION =>
        {
            (Some(x), Some(y))
        }
        _ => (None, None),
    };
    Geometry { width, height, x, y }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(w: f64, h: f64, x: Option<f64>, y: Option<f64>) -> Geometry {
        Geometry { width: w, height: h, x, y }
    }

    #[test]
    fn defaults_when_missing_or_not_finite() {
        let d = clamp(g(f64::NAN, f64::INFINITY, None, None));
        assert_eq!((d.width, d.height), (1280.0, 840.0));
        let from_json: Geometry = serde_json::from_str("{}").unwrap();
        assert_eq!(clamp(from_json), Geometry::default());
        let nulls: Geometry = serde_json::from_str(r#"{"width":null,"height":null}"#).unwrap();
        assert_eq!(clamp(nulls), Geometry::default());
    }

    #[test]
    fn min_and_max_clamp() {
        let c = clamp(g(10.0, 10.0, None, None));
        assert_eq!((c.width, c.height), (640.0, 480.0));
        let c = clamp(g(1e9, 1e9, None, None));
        assert_eq!((c.width, c.height), (10000.0, 10000.0));
    }

    #[test]
    fn position_rules() {
        let ok = clamp(g(800.0, 600.0, Some(100.0), Some(-50.0)));
        assert_eq!((ok.x, ok.y), (Some(100.0), Some(-50.0)));
        let far = clamp(g(800.0, 600.0, Some(1e6), Some(0.0)));
        assert_eq!((far.x, far.y), (None, None));
        let nan = clamp(g(800.0, 600.0, Some(f64::NAN), Some(0.0)));
        assert_eq!((nan.x, nan.y), (None, None));
        let half = clamp(g(800.0, 600.0, Some(10.0), None));
        assert_eq!((half.x, half.y), (None, None));
    }
}
