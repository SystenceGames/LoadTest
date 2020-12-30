import events = require('events');

class SplitStreamOnNewJSON extends events.EventEmitter {
	private buffers: Array<any> = new Array<any>();
	private openBracesCount = 0;
	private closeBracesCount = 0;

	public lookForJSON(chunk: Buffer) {
		let start = 0;
		for (let i = 0; i < chunk.length; i++) {
			if (chunk[i] === 123) { // {
				this.openBracesCount++;
			} else if (chunk[i] === 125) { // }
				this.closeBracesCount++;
				if (this.openBracesCount > 0 && (this.openBracesCount == this.closeBracesCount)) {
					//Found a full JSON
					//Reset braces counts
					this.openBracesCount = 0;
					this.closeBracesCount = 0;
					//add what we've searched until to buffers, less anything at the start
					this.buffers.push(chunk.slice(start, i + 1));
					//Push buffers to consumers
					this.emit('data', Buffer.concat(this.buffers));
					//Reset buffers
					this.buffers = [];
					//Look for JSONs in the remainder of the chunk
					this.lookForJSON(chunk.slice(i + 1));
				}
			} else if (this.openBracesCount == 0) {
				//if we find data outside of braces we tell the algorithm to copy only after it
				start = i + 1;
			}
		}
		//If we didn't find anything whole push to buffers, removing anything thats data outside of braces
		this.buffers.push(chunk.slice(start));
	}
}

export = SplitStreamOnNewJSON;