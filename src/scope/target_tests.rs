#![allow(
    clippy::expect_used,
    reason = "test fixtures require known-valid targets"
)]
use super::Target;
use proptest::prelude::*;

proptest! {
    #[test]
    fn wildcard_requires_a_complete_subdomain_label(label in "[a-z]{1,30}", port in 1u16..=65535) {
        let target = Target::parse("*.example.com").expect("valid target");
        let inside = url::Url::parse(&format!("https://{label}.example.com:{port}")).expect("valid URL");
        let outside = url::Url::parse(&format!("https://{label}example.com:{port}")).expect("valid URL");
        prop_assert!(target.matches(&inside));
        prop_assert!(!target.matches(&outside));
    }

    #[test]
    fn arbitrary_target_is_safe_to_parse(value in ".{0,256}") {
        let _ = Target::parse(&value);
    }
}
