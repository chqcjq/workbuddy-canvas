// Auto-extracted high-value office + e-commerce prompt templates from D:/codespace/ai-hand/templates.json
// Source project is NOT modified; this is a curated, read-only copy of selected entries.
export const PROMPT_TEMPLATE_GROUPS = [
  {
    "group": "电商",
    "items": [
      {
        "id": "commerce_product",
        "name": "电商主图",
        "desc": "专业商品展示图",
        "needUpload": true,
        "icon": "🛍️",
        "prompt": "基于上传的商品照片，生成一张电商主图。展示风格：{style}。{selling}。专业棚拍灯光，柔光+轮廓光，材质细节清晰。背景干净，构图突出产品。商业摄影级品质，1:1方形。",
        "params": [
          {
            "key": "style",
            "label": "展示风格",
            "placeholder": "如：简约白底、场景化、高端暗调"
          },
          {
            "key": "selling",
            "label": "卖点文案",
            "placeholder": "如：新品上市、限时特惠"
          }
        ]
      },
      {
        "id": "commerce_product_detail",
        "name": "电商详情图",
        "desc": "产品电商详情页主图，多角度展示+卖点提炼",
        "needUpload": true,
        "icon": "🛍️",
        "prompt": "基于上传的产品图片，生成一张电商详情页主图，产品名称：{product_name}，核心卖点：{selling_points}，视觉风格：{style}。画面为竖版9:16比例，采用模块化布局。顶部为产品主视觉区，展示产品正面45度角精美呈现，背景简洁高级，符合{style}风格调性。中部为多角度展示区，包含产品正面、侧面、背面、细节特写4个小图，网格排列。中下部为核心卖点提炼区，3-5个图标+短句卖点标签。底部为产品参数/规格简表和品牌区域。整体要求：干净高级的商业摄影感，光影层次丰富，产品质感真实细腻，标签文字清晰可读，配色统一和谐，适合淘宝/京东/天猫等电商平台详情页首屏使用。拒绝廉价感、过度修图、颜色失真。8K分辨率，商业级输出质量。",
        "params": [
          {
            "key": "product_name",
            "label": "产品名称",
            "placeholder": "如：无线蓝牙耳机、护肤精华液、智能手表"
          },
          {
            "key": "selling_points",
            "label": "核心卖点",
            "placeholder": "如：降噪续航轻薄、补水提亮抗衰"
          },
          {
            "key": "style",
            "label": "视觉风格",
            "placeholder": "如：科技感、奢华风、简约清新、国潮"
          }
        ]
      },
      {
        "id": "commerce_explode",
        "name": "爆炸拆解图",
        "desc": "产品爆炸拆解/技术分解图",
        "needUpload": true,
        "icon": "🔧",
        "prompt": "基于上传的{product}照片，生成一张高端产品爆炸拆解图。各组件精密展开悬浮排列，每个部件用细线标注中文名称。背景纯白或深色，棚拍光影，8K细节。Apple产品发布会风格，专业科技感。1:1方形或9:16竖版。",
        "params": [
          {
            "key": "product",
            "label": "产品名称",
            "placeholder": "如：智能手机、耳机、手表"
          }
        ]
      },
      {
        "id": "business_tech_explode",
        "name": "科技产品拆解",
        "desc": "VR头显/智能设备爆炸拆解图，技术分解说明",
        "needUpload": false,
        "icon": "🔧",
        "prompt": "生成一张科技产品爆炸拆解图。产品：{product}，品牌：{brand}。整体风格为clean high-tech 3D render，studio lighting，glowing accents，柔和渐变背景。布局：中央为产品主体垂直堆叠爆炸视图，展示9个独立分层组件：外壳、传感器、主板芯片、透镜、内部框架、电池、侧带、头带、面罩垫。左右两侧分布8个引线标注，左侧3个中文技术说明，右侧5个中文功能描述。顶部品牌Logo和产品名称，底部品牌标语和特性亮点标签。整体科技感强，专业产品发布会风格，适合商业展示使用。画面比例4:3横版，8K分辨率。",
        "params": [
          {
            "key": "product",
            "label": "产品名称",
            "placeholder": "如：VR头显、智能手表、无线耳机"
          },
          {
            "key": "brand",
            "label": "品牌",
            "placeholder": "如：Meta Quest、Apple Watch、AirPods"
          }
        ]
      },
      {
        "id": "biz_product_storyboard",
        "name": "产品广告分镜",
        "desc": "12格广告分镜图，电影级产品展示",
        "needUpload": false,
        "icon": "🎬",
        "prompt": "一张专业产品广告分镜图，12个镜头在一张图上，4×3排版，每张图画面比例9:16。整体风格为{style}，产品是{product_type}，色调为{color_tone}。画面内容包含产品特写、使用过程、模特展示、功效展示、hero shot，每格镜头都不同，有电影感，广告级构图，统一品牌视觉。{brand_name}品牌元素统一融入。超写实，高清细节，适合后续做视频分镜。8K分辨率，商业级视觉质量。",
        "params": [
          {
            "key": "product_type",
            "label": "产品类型",
            "placeholder": "如：口红、香水、护肤品、手表、饮料"
          },
          {
            "key": "style",
            "label": "整体风格",
            "placeholder": "如：高端、奢侈、科技、清新、潮流"
          },
          {
            "key": "color_tone",
            "label": "色调方向",
            "placeholder": "如：黑金红、白银灰、蓝白科技感"
          },
          {
            "key": "brand_name",
            "label": "品牌名称（选填）",
            "placeholder": "如：CHANEL、Apple、小鹏"
          }
        ]
      }
    ]
  },
  {
    "group": "品牌 / 办公",
    "items": [
      {
        "id": "brand_identity",
        "name": "品牌VI系统",
        "desc": "完整品牌视觉识别系统",
        "needUpload": false,
        "icon": "🏷️",
        "prompt": "为\"{brand}\"设计一套完整品牌视觉识别系统。行业：{industry}，品牌关键词：{keywords}。包含：Logo方案、主辅色板（含HEX代码）、字体系统、辅助图形、应用示意（名片、App图标、包装、工牌）。统一风格，现代高级感。多画面展示，结构化排版。",
        "params": [
          {
            "key": "brand",
            "label": "品牌名称",
            "placeholder": "如：星辰咖啡、量子科技"
          },
          {
            "key": "industry",
            "label": "行业",
            "placeholder": "如：餐饮、科技、时尚"
          },
          {
            "key": "keywords",
            "label": "品牌关键词",
            "placeholder": "如：年轻、活力、专业"
          }
        ]
      },
      {
        "id": "brand_logo",
        "name": "Logo设计",
        "desc": "创意Logo设计方案",
        "needUpload": false,
        "icon": "™️",
        "prompt": "为\"{brand}\"设计4-6个不同方向的Logo方案。品牌描述：{desc}。Logo风格：{style}。每个方案展示Logo+简要设计说明。统一排版在一张展示图中，白底或深色背景，专业设计提案风格。高质量矢量感。",
        "params": [
          {
            "key": "brand",
            "label": "品牌名称",
            "placeholder": "输入品牌名"
          },
          {
            "key": "style",
            "label": "Logo风格",
            "placeholder": "如：几何、字标、图形、极简"
          },
          {
            "key": "desc",
            "label": "品牌描述",
            "placeholder": "一句话描述品牌"
          }
        ]
      },
      {
        "id": "brand_identity_kit",
        "name": "品牌素材套组",
        "desc": "为品牌、门店或个人 IP 生成统一视觉主图和社媒素材",
        "needUpload": false,
        "icon": "牌",
        "prompt": "为品牌{brand_name}生成一套{brand_style}风格的品牌素材主视觉，使用场景为{usage}。画面包含品牌主图、社媒封面、色彩系统、图形元素和应用示意，整体统一、有商业质感，中文标题清晰可读，适合朋友圈、小红书和企业传播使用，竖版9:16。",
        "params": [
          {
            "key": "brand_name",
            "label": "品牌名称",
            "placeholder": "如：山海咖啡、青橙护肤、Luna Studio"
          },
          {
            "key": "brand_style",
            "label": "品牌风格",
            "placeholder": "如：高级极简、年轻活力、东方雅致、科技感"
          },
          {
            "key": "usage",
            "label": "使用场景",
            "placeholder": "如：朋友圈招商、门店开业、小红书封面、企业介绍"
          }
        ]
      }
    ]
  },
  {
    "group": "营销海报",
    "items": [
      {
        "id": "poster_festival",
        "name": "节日营销海报",
        "desc": "节日活动、门店促销和私域转发海报",
        "needUpload": false,
        "icon": "节",
        "prompt": "生成一张节日营销海报，主题为{festival}，利益点为{offer}。画面有节日氛围、清晰标题、醒目利益点和适合社交转发的版式，竖版9:16。",
        "params": [
          {
            "key": "festival",
            "label": "节日或活动",
            "placeholder": "如：端午礼盒、七夕上新、周年庆"
          },
          {
            "key": "offer",
            "label": "活动利益点",
            "placeholder": "如：满199减30、第二件半价"
          }
        ]
      },
      {
        "id": "poster_sport",
        "name": "运动海报",
        "desc": "运动品牌Campaign海报",
        "needUpload": false,
        "icon": "🏃",
        "prompt": "设计一张{sport}商业Campaign海报。大字标题\"{slogan}\"，辅助文案简短有力。主体为运动员动态姿态，核心道具以夸张比例或对角构图成为视觉锚点。高端运动品牌广告风格，强光影，反光地面，干净构图，品牌化配色。1:1或9:16。",
        "params": [
          {
            "key": "sport",
            "label": "运动项目",
            "placeholder": "如：篮球、跑步、瑜伽、游泳"
          },
          {
            "key": "slogan",
            "label": "品牌口号",
            "placeholder": "如：突破极限、永不放弃"
          }
        ]
      },
      {
        "id": "poster_science",
        "name": "科普海报",
        "desc": "Apple风格自然科普海报",
        "needUpload": false,
        "icon": "🔬",
        "prompt": "生成一张9:16竖版高级科普海报，Apple Keynote风格。主题：{subject}。纯白背景，主体极度放大占据50-70%画面，超高清真实质感。顶部左侧大标题（{subject}）+副标题+英文名。底部四列极简icon+标题+短说明：{facts}。极简排版，大量留白，高级感。禁止使用卡片框和圆角背景。",
        "params": [
          {
            "key": "subject",
            "label": "科普主题",
            "placeholder": "如：北极熊、深海章鱼、雪豹"
          },
          {
            "key": "facts",
            "label": "科普要点",
            "placeholder": "列出3-4个关键知识点"
          }
        ]
      },
      {
        "id": "poster_city",
        "name": "城市宣传",
        "desc": "城市旅游宣传海报",
        "needUpload": false,
        "icon": "🏙️",
        "prompt": "设计一张{city}城市宣传海报。{style}风格，展现{city}的标志性建筑和文化元素。S形曲线构图，大面积留白，高级感。标题文字\"{city}\"清晰可读，底部可加宣传语。9:16竖版，高端城市海报美学。",
        "params": [
          {
            "key": "city",
            "label": "城市名称",
            "placeholder": "如：北京、上海、成都、杭州"
          },
          {
            "key": "style",
            "label": "风格",
            "placeholder": "如：国潮、水彩、赛博朋克、极简"
          }
        ]
      },
      {
        "id": "poster_movie",
        "name": "电影海报",
        "desc": "大片级电影宣传海报",
        "needUpload": false,
        "icon": "🎬",
        "prompt": "Design a cinematic movie poster for \"{title}\". Genre: {genre}. Story: {desc}. Dramatic lighting, high contrast, professional movie poster composition. Title text \"{title}\" in bold cinematic font, prominently displayed. Subtitle and billing block at bottom. Aspect ratio 9:16, ultra detailed, Hollywood quality.",
        "params": [
          {
            "key": "title",
            "label": "电影标题",
            "placeholder": "如：星际迷航、暗夜追踪"
          },
          {
            "key": "genre",
            "label": "类型",
            "placeholder": "如：科幻、悬疑、爱情、动作"
          },
          {
            "key": "desc",
            "label": "剧情描述",
            "placeholder": "简要描述电影内容和氛围"
          }
        ]
      },
      {
        "id": "poster_typography",
        "name": "概念字体",
        "desc": "创意概念字体海报",
        "needUpload": false,
        "icon": "🔤",
        "prompt": "Create ONE finished premium conceptual typography poster for the exact title: \"{word}\". The title must be the dominant visual structure: huge, readable, powerful, spelled exactly. Silently interpret the title's meaning and turn it into one strong visual metaphor. Custom letterforms whose weight, width, and texture express the temperament. Restrained 4-6 color system. Museum-quality graphic design, dramatic scale, strong hierarchy. 9:16 vertical format.",
        "params": [
          {
            "key": "word",
            "label": "核心词语",
            "placeholder": "如：自由、梦想、勇敢、未来"
          }
        ]
      }
    ]
  }
]

// Replace {key} placeholders with editable [label] hints so the user can fill them in.
export function renderPromptTemplate(tpl, values) {
  let s = tpl.prompt
  for (const p of tpl.params || []) {
    const val = (values && values[p.key] != null && values[p.key] !== '') ? values[p.key] : '[' + p.label + ']'
    s = s.split('{' + p.key + '}').join(val)
  }
  return s
}
