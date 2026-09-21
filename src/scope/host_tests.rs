use super::canonical_host;
use proptest::prelude::*;
use std::net::{Ipv4Addr, Ipv6Addr};
use url::Host;

proptest! {
    #[test]
    fn ipv4_literals_preserve_address_identity(bytes in any::<[u8; 4]>()) {
        let address = Ipv4Addr::from(bytes).to_string();
        prop_assert_eq!(canonical_host(&address), Some(address));
    }

    #[test]
    fn ipv6_literals_use_url_host_normalization(parts in any::<[u16; 8]>()) {
        let address = Ipv6Addr::from(parts);
        prop_assert_eq!(canonical_host(&address.to_string()), Some(Host::<String>::Ipv6(address).to_string()));
    }
}
