use std::net::IpAddr;
use url::Host;

pub(super) fn canonical_host(value: &str) -> Option<String> {
    match value.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) => Some(address.to_string()),
        Ok(IpAddr::V6(address)) => Some(Host::<String>::Ipv6(address).to_string()),
        Err(_) => canonical_domain(value),
    }
}

fn canonical_domain(value: &str) -> Option<String> {
    if !valid_domain_input(value) {
        return None;
    }
    let domain = match Host::parse(value).ok()? {
        Host::Domain(domain) => domain,
        Host::Ipv4(_) | Host::Ipv6(_) => return None,
    };
    let domain = domain.strip_suffix('.').unwrap_or(&domain);
    if domain.len() > 253 || !domain.split('.').all(valid_label) {
        return None;
    }
    Some(domain.to_owned())
}

fn valid_label(label: &str) -> bool {
    let bytes = label.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 63
        && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
        && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

fn valid_domain_input(value: &str) -> bool {
    let numeric_range = value
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'.' | b'-' | b','));
    !numeric_range && !value.contains('%') && !value.chars().any(char::is_whitespace)
}

#[cfg(test)]
#[path = "host_tests.rs"]
mod tests;
