'use client';


import { AppBar, Box, Chip, Toolbar, Typography } from "@mui/material";
import Link from "next/link";

const Navbar = () => (
  <AppBar position="sticky" elevation={0} sx={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.1)", zIndex: 1000 }}>
    <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
      <Link href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "12px", flexGrow: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <img src="/LOGO/logo.png" alt="elixpo" style={{ height: "28px", width: "28px", backgroundSize: "cover", objectFit: "cover", borderRadius: "10px"}} />
          <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "1.2rem", fontFamily: "monospace" }}>Accounts x Elixpo</Typography>
        </Box>
        <Chip label="2026" size="small" sx={{ bgcolor: "rgba(132, 204, 22, 0.1)", color: "#84cc16", fontSize: "10px", height: "22px", fontFamily: "monospace", fontWeight: 500, border: "1px solid rgba(132, 204, 22, 0.3)" }} />
      </Link>
    </Toolbar>
  </AppBar>
);

export default Navbar;