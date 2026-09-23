export namespace main {
	
	export class SystemSpecs {
	    os: string;
	    cpu: string;
	    ram: string;
	    gpu: string;
	    dx: string;
	    net: string;
	    storage: string;
	    sound: string;
	    notes: string;
	
	    static createFrom(source: any = {}) {
	        return new SystemSpecs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.os = source["os"];
	        this.cpu = source["cpu"];
	        this.ram = source["ram"];
	        this.gpu = source["gpu"];
	        this.dx = source["dx"];
	        this.net = source["net"];
	        this.storage = source["storage"];
	        this.sound = source["sound"];
	        this.notes = source["notes"];
	    }
	}
	export class SpecsContainer {
	    min: SystemSpecs;
	    rec: SystemSpecs;
	
	    static createFrom(source: any = {}) {
	        return new SpecsContainer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.min = this.convertValues(source["min"], SystemSpecs);
	        this.rec = this.convertValues(source["rec"], SystemSpecs);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Game {
	    id: string;
	    title: string;
	    thumbnail: string;
	    link: string;
	    genre: string;
	    size: string;
	    price: string;
	    steamAppId: string;
	    specs: SpecsContainer;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Game(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.link = source["link"];
	        this.genre = source["genre"];
	        this.size = source["size"];
	        this.price = source["price"];
	        this.steamAppId = source["steamAppId"];
	        this.specs = this.convertValues(source["specs"], SpecsContainer);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Software {
	    id: string;
	    title: string;
	    thumbnail: string;
	    link: string;
	    website: string;
	    category: string;
	    version: string;
	    license: string;
	    platform: string;
	    size: string;
	    price: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Software(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.link = source["link"];
	        this.website = source["website"];
	        this.category = source["category"];
	        this.version = source["version"];
	        this.license = source["license"];
	        this.platform = source["platform"];
	        this.size = source["size"];
	        this.price = source["price"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class SoftwareImportResult {
	    title: string;
	    thumbnail: string;
	    category: string;
	    version: string;
	    license: string;
	    platform: string;
	    website: string;
	
	    static createFrom(source: any = {}) {
	        return new SoftwareImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.category = source["category"];
	        this.version = source["version"];
	        this.license = source["license"];
	        this.platform = source["platform"];
	        this.website = source["website"];
	    }
	}
	
	export class SteamImportResult {
	    appId: string;
	    title: string;
	    thumbnail: string;
	    genre: string;
	    developer: string;
	    releaseDate: string;
	    price: string;
	    specs: SpecsContainer;
	
	    static createFrom(source: any = {}) {
	        return new SteamImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appId = source["appId"];
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.genre = source["genre"];
	        this.developer = source["developer"];
	        this.releaseDate = source["releaseDate"];
	        this.price = source["price"];
	        this.specs = this.convertValues(source["specs"], SpecsContainer);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

