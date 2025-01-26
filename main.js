const https = require('https');
const { type } = require('os');


/*
 * BiliSupported 扩展 for SimMusic
 * 本扩展由 @PYLXU 编写
 * 本扩展基于 SimMusic 内置本地音乐加载器 修改
 * 亦可用作扩展开发示例以添加其他音乐源
 * 若无特殊说明，基本所有的file变量格式都是“scheme: + <id>”，自己开发时候请不要忘了添加scheme:前缀
 */


/**************** 基础配置 ****************/
// 当没有config.setItem时，调用config.getItem会返回defaultConfig中的值

// defaultConfig["folderLists"] = [];


/**************** 工具函数 ****************/
// 这些函数是插件自己需要的函数，个人推荐const一个object然后都用它存放，防止和主程序内置函数名冲突
const FileExtensionTools = {
	convertToLrc: (jsonData) => {
		let lrcText = "";
		jsonData.body.forEach((item) => {
			const fromTime = item.from;
			const toTime = item.to;
			const content = item.content;
			const fromTimeStr = `[${this.padTime(fromTime)}]`;
			const toTimeStr = `[${this.padTime(toTime)}]`;
			lrcText += `${fromTimeStr}${content}\n`;
			lrcText += `${toTimeStr}${content}\n`;
		});
		return lrcText;
	},
	padTime: (time) => {
		const minutes = Math.floor(time / 60).toString().padStart(2, "0");
		const seconds = (time % 60).toFixed(2).padStart(5, "0");
		return `${minutes}:${seconds}`;
	},
	openCategory: async (bvid) => {
		const response = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + category);
		const metadata = await response.json();
	},
	fileMenuItem: [
		{ type: ["single"], content: { label: "在资源管理器显示", icon: "ED8A", click() { shell.showItemInFolder(getCurrentSelected()[0]) } } }
	]
}



/**************** 左侧导航 ****************/
// 如果你懒，这个字段可以不写，这样插件就没有左侧导航功能（你可以参考下面的写搜索功能）
ExtensionConfig.bilibili.musicList = {
	// 这个函数用于处理用户点击歌单“加号”的事件
	// 如果没有（例如你的插件是自动同步一个用户的所有歌单），可以不写，这样加号图标就不会显示
	add(callback) {
		// 这里自己实现添加逻辑，简单输入可直接调内置的 prompt(placeholder:str, callback:function) 方法
		ipcRenderer.invoke("pickFolder")
			.then(dir => {
				if (!dir || !dir[0]) return;
				dir = dir[0].trim().replaceAll("/", "\\");
				// 内置config读取可用getItem
				const lists = config.getItem("folderLists");
				// 由于数据格式由开发者自行定义，重复导入 & 其他错误需要开发者自行处理
				if (dir.split("\\").length == 2 && !dir.split("\\")[1]) return alert("您不能导入磁盘根目录。");
				if (lists.includes(dir)) return alert("此目录已被添加到目录列表中。");
				lists.push(dir);
				// 内置config写入可用setItem
				config.setItem("folderLists", lists);
				// 导入成功后需开发者自行调用callback以更新左侧显示内容（必须），switchList以打开刚才导入的歌单（可选）
				callback();
				ExtensionConfig.file.musicList.switchList(dir);
			});
	},
	// 这个函数用于渲染左侧的歌单列表
	renderList(container) {
		const lists = config.getItem("folderLists");
		lists.forEach(name => {
			const splitted = name.split("\\");
			const folderName = splitted[splitted.length - 1];
			// 创建一个div即可，可以不需要有类名
			const element = document.createElement("div");
			element.textContent = folderName;
			element.dataset.folderName = name;
			// 处理点击，一般直接switchList即可
			element.onclick = () => { this.switchList(name); };
			// 创建右键菜单，具体使用方法参考 zhujin917/3sqrt7-context-menu/README.md
			element.oncontextmenu = event => {
				new ContextMenu([
					{ label: "查看歌曲", icon: "ECB5", click() { element.click(); } },
					{ label: "在资源管理器中显示", icon: "ED8A", click() { shell.openPath(name); } },
					{ type: "separator" },
					{
						label: "添加到歌单", icon: "EE0D", submenu: MusicList.getMenuItems(listName => {
							MusicList.importToMusicList(listName, FileExtensionTools.scanMusic(name));
							MusicList.switchList(listName, true);
						})
					},
					{
						label: "从列表中移除", icon: "ED74", click() {
							confirm(`目录「${folderName}」将从 SimMusic 目录列表中移除，但不会从文件系统中删除。是否继续？`, () => {
								const lists = config.getItem("folderLists");
								lists.splice(lists.indexOf(name), 1);
								config.setItem("folderLists", lists);
								if (element.classList.contains("active")) switchRightPage("rightPlaceholder");
								element.remove();
							});
						}
					},
				]).popup([event.clientX, event.clientY]);
			};
			// 把div附加到左侧界面，container会由ExtensionRuntime自动传入，无需担心是否存在
			container.appendChild(element);
		});
	},
	// 这个函数用于切换歌单
	switchList(name) {
		const splitted = name.split("\\");
		// 统一调用renderMusicList即可，第二个参数需要传入一个用于识别“当前歌单”的唯一的参数，推荐使用插件名+歌单id以防重复
		// 如果你的scanMusic必须是异步的，可以先renderMusicList([], id)以切换界面，再renderMusicList(list, id)，id一样就可以
		// rML第三个参数请固定false，第4个参数指定是否进行预先渲染，如果为true则在二次渲染之前不会显示歌单（适用于在线歌曲必须要获取metadata的情况）
		renderMusicList(FileExtensionTools.scanMusic(name), {
			uniqueId: "folder-" + name,
			errorText: "当前目录为空",
			menuItems: FileExtensionTools.fileMenuItem,
			musicListInfo: {
				name: splitted[splitted.length - 1],
				dirName: name,
			}
		});
		// 这个用于把当前歌单标蓝，放在renderMusicList函数后运行，推荐借鉴我的写法在renderList函数里自己设一个dataset，然后遍历dataset
		document.querySelectorAll(".left .leftBar div").forEach(ele => {
			if (ele.dataset.folderName != name) ele.classList.remove("active");
			else ele.classList.add("active");
		});
	},
};


/**************** 获取数据 ****************/
// 这个函数用于读取音乐元数据，不管你是本地还是在线，无所谓你咋获取，最后都调callback(data)就行。
// 如果是在线的用fetch就更好做，直接修改我musicmetadata的promise就得
//【注意：读取失败可以返回null，各字段值可以没有】
ExtensionConfig.bilibili.readMetadata = async (file) => {
	// 因为分P的问题，这里的file格式是“bilibili:<bvid>-<cid>”，所以需要分割一下
	// 而分P的视频标题啥的是一样的，所以不需要专门获取，只需要一个bvid就行了
	const id = file.replace("bilibili:", "");
	const bvid = id.split("-")[0];
	const cid = id.split("-")[1];
	const response = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid);
	const metadata = await response.json();
	return {
		title: metadata.data.title,
		artist: metadata.data.owner.name,
		album: metadata.data.tname_v2 ? metadata.data.tname_v2 : "未知专辑",
		time: metadata.data.duration,
		cover: metadata.data.pic ? metadata.data.pic : ""
	};
};


/**************** 歌曲播放 ****************/
ExtensionConfig.bilibili.player = {
	// 这个函数用于获取播放地址，返回值可以是本地文件地址 / http(s)地址 / blob地址 / base64 dataurl，不成功可以用空参数调callback
	//【注意：读取失败return可以用空串】
	async getPlayUrl(file) {
		const id = file.replace("bilibili:", "");
		const bvid = id.split("-")[0];
		let cid = id.split("-")[1];
		// 这里的cid需要从file中读取来处理分P的情况
		// cid为空或者default的时候需要获取第一分P的真实cid
		// 如果cid已经传入了就不再获取第一P了
		if(!cid || cid == "default") {
			try {
				cid = await new Promise((resolve, reject) => {
					https.get(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, (res) => {
						let data = '';
						res.on('data', chunk => data += chunk);
						res.on('end', () => resolve(JSON.parse(data).data[0].cid));
					}).on('error', reject);
				});
			} catch (error) {
				console.error("Error fetching CID:", error);
				return "";
			}
		}

		let downloadUrl;
		try {
			downloadUrl = await new Promise((resolve, reject) => {
				https.get(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}`, (res) => {
					let data = '';
					res.on('data', chunk => data += chunk);
					res.on('end', () => resolve(JSON.parse(data).data.durl[0].url));
				}).on('error', reject);
			});
		} catch (error) {
			console.error("Error fetching download URL:", error);
			return "";
		}

		const downloadAudio = async (url, start, end) => {
			return new Promise((resolve, reject) => {
				const options = {
					headers: {
						"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
						"Accept-Encoding": "gzip",
						"Origin": "https://www.bilibili.com",
						"Referer": "https://www.bilibili.com/" + id,
						"Range": `bytes=${start}-${end}`
					},
					minVersion: 'TLSv1.2',
					maxVersion: 'TLSv1.3'
				};
				https.get(url, options, (res) => {
					const chunks = [];
					res.on('data', chunk => chunks.push(chunk));
					res.on('end', () => resolve(Buffer.concat(chunks)));
				}).on('error', reject);
			});
		};

		const getAudioSize = async (url) => {
			return new Promise((resolve, reject) => {
				const options = {
					headers: {
						"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
						"Accept-Encoding": "gzip",
						"Origin": "https://www.bilibili.com",
						"Referer": "https://www.bilibili.com/" + id
					},
					method: 'HEAD',
					minVersion: 'TLSv1.2',
					maxVersion: 'TLSv1.3'
				};
				https.get(url, options, (res) => {
					const size = parseInt(res.headers['content-length'], 10);
					resolve(size);
				}).on('error', reject);
			});
		};

		let audioBuffer;
		try {
			const size = await getAudioSize(downloadUrl);
			const chunkSize = Math.ceil(size / 10);
			const promises = [];
			for (let i = 0; i < 10; i++) {
				const start = i * chunkSize;
				const end = (i + 1) * chunkSize - 1;
				promises.push(downloadAudio(downloadUrl, start, end));
			}
			const chunks = await Promise.all(promises);
			audioBuffer = Buffer.concat(chunks);
		} catch (error) {
			console.error("Error fetching audio buffer:", error);
			return "";
		}

		const base64Audio = audioBuffer.toString('base64');
		return `data:audio/mp3;base64,${base64Audio}`;
	},
	// 这个函数用于（在本地索引没有歌词的情况下获取歌词），例如在线播放时把歌词全部写到索引不太现实，就会调用这个方法直接读取
	//【注意：读取失败return可以用空串】
	async getLyrics(file) {
		const id = file.replace("bilibili:", "");
		const bvid = id.split("-")[0];
		let cid = id.split("-")[1];
		if(!cid || cid == "default") {
			try {
				cid = await new Promise((resolve, reject) => {
					https.get(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, (res) => {
						let data = '';
						res.on('data', chunk => data += chunk);
						res.on('end', () => resolve(JSON.parse(data).data[0].cid));
					}).on('error', reject);
				});
			} catch (error) {
				console.error("Error fetching CID:", error);
				return "";
			}
		}
		try {
			const response = await fetch(`https://api.3r60.top/v2/bili/t/?bvid=${bvid}&cid=${cid}`);
			const data = await response.text();
			return data;
		} catch (error) {
			console.error("Error fetching lyrics:", error);
			return "";
		}
	}
};


/**************** 歌曲搜索 ****************/
ExtensionConfig.bilibili.search = async (keyword, _page) => {
	let resultArray = [];
	const response = await fetch("https://api.3r60.top/v2/bili/s/?keydown=" + encodeURI(keyword));
	const result = await response.json();
	resultArray = result.data.result.map(item => "bilibili:" + item.bvid + "-default");
	let menu = [];
	menu.push({ type: "single" , content: { type: "separator" } });
	menu.push({
		type: "single",
		content: {
			label: "播放视频",
			icon: "EABF",
			click() {
				const files = getCurrentSelected();
				const id = files[0].replace("bilibili:", "");
				const bvid = id.split("-")[0];
				webview(`https://www.bilibili.com/video/${bvid}`,{width: 1366, height: 768});
			}
		}
	});
	menu.push({
		type: "single",
		content: {
			label: "查看合集",
			icon: "ED8A",
			click() {
				const files = getCurrentSelected();
				const id = files[0].replace("bilibili:", "");
				const bvid = id.split("-")[0];

			}
		}
	});
	// 此处的分集就是指的分P
	menu.push({
		type: "single",
		content: {
			label: "查看分集",
			icon: "ED89",
			click() {
				const files = getCurrentSelected();
				const id = files[0].replace("bilibili:", "");
				const bvid = id.split("-")[0];

			}
		}
	});
	menu.push({ type: "single" , content: { type: "separator" } });
	menu.push(DownloadController.getMenuItems());

	return {
		files: resultArray,
		menu,
		hasMore: false
	};
}
