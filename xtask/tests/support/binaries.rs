use std::io;

fn set(bytes: &mut [u8], offset: usize, value: &[u8]) -> io::Result<()> {
    bytes
        .get_mut(offset..offset + value.len())
        .ok_or(io::ErrorKind::InvalidInput)?
        .copy_from_slice(value);
    Ok(())
}

pub fn windows() -> io::Result<Vec<u8>> {
    let mut bytes = vec![0; 392];
    set(&mut bytes, 0, b"MZ")?;
    set(&mut bytes, 60, &128_u32.to_le_bytes())?;
    set(&mut bytes, 128, b"PE\0\0")?;
    set(&mut bytes, 132, &0x8664_u16.to_le_bytes())?;
    set(&mut bytes, 148, &240_u16.to_le_bytes())?;
    set(&mut bytes, 150, &0x22_u16.to_le_bytes())?;
    set(&mut bytes, 152, &0x20b_u16.to_le_bytes())?;
    set(&mut bytes, 168, &1_u32.to_le_bytes())?;
    Ok(bytes)
}

pub fn linux(machine: u16, interpreter: bool) -> io::Result<Vec<u8>> {
    let mut bytes = vec![0; 120];
    set(&mut bytes, 0, b"\x7fELF\x02\x01\x01")?;
    set(&mut bytes, 16, &2_u16.to_le_bytes())?;
    set(&mut bytes, 18, &machine.to_le_bytes())?;
    set(&mut bytes, 20, &1_u32.to_le_bytes())?;
    set(&mut bytes, 24, &1_u64.to_le_bytes())?;
    set(&mut bytes, 52, &64_u16.to_le_bytes())?;
    set(&mut bytes, 54, &56_u16.to_le_bytes())?;
    set(&mut bytes, 58, &64_u16.to_le_bytes())?;
    if interpreter {
        set(&mut bytes, 32, &64_u64.to_le_bytes())?;
        set(&mut bytes, 56, &1_u16.to_le_bytes())?;
        set(&mut bytes, 64, &3_u32.to_le_bytes())?;
    }
    Ok(bytes)
}

pub fn macos(cpu: u32) -> io::Result<Vec<u8>> {
    let mut bytes = vec![0; 56];
    set(&mut bytes, 0, &0xfeed_facf_u32.to_le_bytes())?;
    set(&mut bytes, 4, &cpu.to_le_bytes())?;
    set(&mut bytes, 12, &2_u32.to_le_bytes())?;
    set(&mut bytes, 16, &1_u32.to_le_bytes())?;
    set(&mut bytes, 20, &24_u32.to_le_bytes())?;
    set(&mut bytes, 32, &0x8000_0028_u32.to_le_bytes())?;
    set(&mut bytes, 36, &24_u32.to_le_bytes())?;
    set(&mut bytes, 40, &1_u64.to_le_bytes())?;
    Ok(bytes)
}
