/**
 * HR Agent Web Server
 */

import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { networkInterfaces } from "os";
import {
  parseRequirement,
  generateJD,
  generateHiringAdvice,
  formatParsedRequirement,
  formatJD,
  formatHiringAdvice,
} from "./hr-agent-v2/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// API: 分析招聘需求
app.post("/api/analyze", async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: "请输入招聘需求" });
    }
    
    console.log(`\n📝 收到需求: ${input}`);
    
    // 1. 解析需求
    console.log("⏳ 解析需求...");
    const requirement = await parseRequirement(input);
    console.log(`✅ 解析完成: ${requirement.jobTitle} | ${requirement.jobCategory}`);
    
    // 2. 生成 JD
    console.log("⏳ 生成 JD...");
    const jd = await generateJD(requirement);
    console.log("✅ JD 生成完成");
    
    // 3. 生成招聘建议
    console.log("⏳ 生成招聘建议...");
    const advice = await generateHiringAdvice(requirement);
    console.log("✅ 招聘建议生成完成");
    
    // 返回结果
    res.json({
      success: true,
      data: {
        requirement,
        jd,
        advice,
        formatted: {
          requirement: formatParsedRequirement(requirement),
          jd: formatJD(jd),
          advice: formatHiringAdvice(advice),
        },
      },
    });
    
  } catch (error) {
    console.error("❌ 分析失败:", error);
    res.status(500).json({ 
      error: "分析失败，请重试",
      details: error instanceof Error ? error.message : "未知错误"
    });
  }
});

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, "0.0.0.0", () => {
  const interfaces = networkInterfaces();
  let localIP = "localhost";
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }
  
  console.log("\n" + "═".repeat(50));
  console.log("🚀 HR Agent Web 服务已启动");
  console.log("═".repeat(50));
  console.log(`\n📍 本机访问: http://localhost:${PORT}`);
  console.log(`📍 局域网访问: http://${localIP}:${PORT}`);
  console.log(`\n💡 同一 WiFi 下的设备可通过局域网 IP 访问`);
  console.log("");
});
