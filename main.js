const https = require('https');
const { type } = require('os');
const fs = require('fs');
const path = require('path');
const os = require('os');

/*
 * BiliSupported 扩展 for SimMusic
 * 本扩展由 @PYLXU 编写
 * 本扩展基于 SimMusic 内置本地音乐加载器 修改
 * 亦可用作扩展开发示例以添加其他音乐源
 * 若无特殊说明，基本所有的file变量格式都是“scheme: + <id>”，自己开发时候请不要忘了添加scheme:前缀
 */

/**************** 基础配置 ****************/
// 当没有config.setItem时，调用config.getItem会返回defaultConfig中的值

defaultConfig["ext.bilibili.musicList"] = [];
defaultConfig["ext.bilibili.maxTemp"] = 50;
SettingsPage.data.push(
	{ type: "title", text: "[音源扩展]Bilibili支持" },
	{ type: "input", text: "最大缓存文件数", description: "设置缓存文件的最大数量", configItem: "ext.bilibili.maxTemp" },
	{
		type: "button",
		text: "清除缓存",
		onclick: () => {
			const tempDir = path.join(os.tmpdir(), 'sim-music.ext.bilibili', 'cache');
			if (fs.existsSync(tempDir)) {
				fs.readdirSync(tempDir).forEach(file => {
					fs.unlinkSync(path.join(tempDir, file));
				});
				alert("缓存已清除");
			} else {
				alert("没有缓存文件");
			}
		}
	}
);

/**************** 左侧导航 ****************/
// 如果你懒，这个字段可以不写，这样插件就没有左侧导航功能（你可以参考下面的写搜索功能）
const elements = {};
ExtensionConfig.bilibili.musicList = {
	async _import(callback, id, isUpdate = false) {
		let list = config.getItem("ext.bilibili.musicList");
		if (!isUpdate) {
			for (let entry of list) {
				if (entry.id == id) {
					return alert("此歌单「" + entry.name + "」已被添加，请尝试删除后重试。");
				}
			}
		}
		try {
			const response = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + id);
			const metadata = await response.json();
			prompt("请输入歌单名称，留空使用视频名称", async (name) => {
				if (name == "") name = metadata.data.title;
				const bvid = metadata.data.bvid;
				let resultArray = [];

				const pagelistResponse = await fetch("https://api.bilibili.com/x/player/pagelist?bvid=" + bvid);
				const pagelist = await pagelistResponse.json();
				const ugcSeason = metadata.data.ugc_season;
				console.log(ugcSeason.sections[0].episodes.map(item => "bilibili:" + item.bvid + "-default"));
				if (ugcSeason) {
					resultArray = resultArray.concat(ugcSeason.sections[0].episodes.map(item => "bilibili:" + item.bvid + "-default"));

					if (isUpdate) {
						list = list.filter((it) => it.id != id);
					}
					const newEntry = { id, name, songs: resultArray };
					list.push(newEntry);
					config.setItem("ext.bilibili.musicList", list);
					if (isUpdate) {
						ExtensionConfig.bilibili.musicList.switchList(id);
					}
					alert("成功导入歌单 " + name + "，共导入 " + resultArray.length + " 首歌曲。", callback);
				}

				// 因为confirm限制，做并行会导致某些问题，因此分集暂不支持
				// if (pagelist.data.length > 1) {
				// 	const addEpisodes = await new Promise((resolve) => {
				// 		confirm("此视频存在分集，是否将分集作为歌单添加？", resolve);
				// 	});
				// 	if (addEpisodes) {
				// 		resultArray = resultArray.concat(pagelist.data.map(item => "bilibili:" + bvid + "-" + item.cid));
				// 	}
				// }
			});
		} catch (err) {
			alert("导入歌单失败，请稍后重试：" + err);
		}
	},
	add(callback) {
		prompt("请输入Bilibili视频 分享 URL 或 ID 以导入歌单", async (input) => {
			let id;
			try {
				if (/^[a-zA-Z0-9]+$/.test(input)) {
					id = input;
				} else {
					const url = new URL(input);
					const pathParts = url.pathname.split('/');
					id = pathParts.find(part => part.startsWith('BV'));
					if (!id || !/^[a-zA-Z0-9]+$/.test(id)) {
						throw 0;
					}
				}
			} catch {
				return alert("无法解析视频 ID，请检查您输入的内容。");
			}
			await ExtensionConfig.bilibili.musicList._import(callback, id);
		});
	},
	renderList(container) {
		const list = config.getItem("ext.bilibili.musicList");
		if (!list) return;
		if (list.length == 0) return;
		list.forEach((entry) => {
			const element = document.createElement("div");
			element.textContent = entry.name;
			element.onclick = () => this.switchList(entry.id);
			element.oncontextmenu = (event) => {
				new ContextMenu([
					{ label: "查看歌曲", click: element.click },
					{
						label: "重新导入歌单",
						click() {
							confirm(`确认重新导入Bilibili歌单 ${entry.name} 吗？`, () => {
								ExtensionConfig.bilibili.musicList._import(null, entry.id, true);
							});
						}
					},
					{
						label: "从列表中移除",
						click() {
							confirm(`确认移除Bilibili歌单 ${entry.name} 吗？`, () => {
								const currentList = config.getItem("ext.bilibili.musicList");
								config.setItem("ext.bilibili.musicList", currentList.filter((it) => it.id != entry.id));
								if (element.classList.contains("active")) {
									switchRightPage("rightPlaceholder");
								}
								element.remove();
							});
						}
					}
				]).popup([event.clientX, event.clientY]);
			};
			elements[entry.id] = element;
			container.appendChild(element);
		});
	},
	switchList(id) {
		const entry = config.getItem("ext.bilibili.musicList").find((it) => it.id == id);
		renderMusicList(entry.songs, {
			uniqueId: "bilibili-list-" + id,
			errorText: "该歌单为空",
			menuItems: generateMenuItems(),
			musicListInfo: { name: entry.name }
		}, false);
		document.querySelectorAll(".left .leftBar div").forEach((it) => {
			if (it.classList.contains("active")) {
				it.classList.remove("active");
			}
		});
		elements[id].classList.add("active");
	}
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
		const tempDir = path.join(os.tmpdir(), 'sim-music.ext.bilibili', 'cache');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}

		const id = file.replace("bilibili:", "");
		const bvid = id.split("-")[0];
		let cid = id.split("-")[1];
		const cacheFilePath = path.join(tempDir, `${bvid}-${cid}.mp4`);

		if (fs.existsSync(cacheFilePath)) {
			return `file://${cacheFilePath}`;
		}

		if (!cid || cid == "default") {
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

		fs.writeFileSync(cacheFilePath, audioBuffer);

		const maxTemp = config.getItem("ext.bilibili.maxTemp", 50);
		const cachedFiles = fs.readdirSync(tempDir);
		if (cachedFiles.length > maxTemp) {
			const oldestFile = cachedFiles.sort((a, b) => fs.statSync(path.join(tempDir, a)).mtime - fs.statSync(path.join(tempDir, b)).mtime)[0];
			fs.unlinkSync(path.join(tempDir, oldestFile));
		}

		return `file://${cacheFilePath}`;
	},
	// 这个函数用于（在本地索引没有歌词的情况下获取歌词），例如在线播放时把歌词全部写到索引不太现实，就会调用这个方法直接读取
	//【注意：读取失败return可以用空串】
	async getLyrics(file) {
		const id = file.replace("bilibili:", "");
		const bvid = id.split("-")[0];
		let cid = id.split("-")[1];
		if (!cid || cid == "default") {
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

	return {
		files: resultArray,
		menu: generateMenuItems(),
		hasMore: false
	};
}

function generateMenuItems() {
	let menu = [];
	menu.push({ type: "single", content: { type: "separator" } });
	menu.push({
		type: "single",
		content: {
			label: "播放视频",
			icon: "EABF",
			click() {
				const files = getCurrentSelected();
				const id = files[0].replace("bilibili:", "");
				const bvid = id.split("-")[0];
				webview(`https://www.bilibili.com/video/${bvid}`, { width: 1366, height: 768 });
			}
		}
	});
	menu.push({
		type: "single",
		content: {
			label: "查看合集",
			icon: "ED8A",
			async click() {
				const files = getCurrentSelected();
				const id = files[0].replace("bilibili:", "");
				const bvid = id.split("-")[0];

				let resultArray = [];
				const response = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid);
				const result = await response.json();
				if (result.data.ugc_season == null) return alert("此视频不属于任何合集。");
				resultArray = result.data.ugc_season.sections[0].episodes.map(item => "bilibili:" + item.bvid + "-default");


				renderMusicList(resultArray, {
					uniqueId: "bilibili-category-" + bvid,
					errorText: "获取合集信息失败",
					menuItems: menu,
					musicListInfo: { name: result.data.title }
				}, false);

			}
		}
	});
	// 此处的分集就是指的分P
	menu.push({
		type: "single",
		content: {
			label: "查看分集",
			icon: "ED89",
			async click() {
				const files = getCurrentSelected();
				const id = files[0].replace("bilibili:", "");
				const bvid = id.split("-")[0];

				let resultArray = [];
				const response = await fetch("https://api.bilibili.com/x/player/pagelist?bvid=" + bvid);
				const result = await response.json();
				if (result.data.length == 0) return alert("此视频没有分集信息。");
				resultArray = result.data.map(item => "bilibili:" + bvid + "-" + item.cid);


				renderMusicList(resultArray, {
					uniqueId: "bilibili-period-" + bvid,
					errorText: "获取分集信息失败",
					menuItems: menu,
					musicListInfo: { name: "分级详情" }
				}, false);

			}
		}
	});
	menu.push({ type: "single", content: { type: "separator" } });
	// menu.push(DownloadController.getMenuItems());

	return menu;
}
